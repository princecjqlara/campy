/**
 * AI Flow Builder Service
 * Admin-defined chatbot flows with decision trees and conditions
 * Module 5 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { logSafetyEvent, activateHumanTakeover } from './safetyLayer';
import { nvidiaChat } from './aiService';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Flow node types
 */
export const NODE_TYPES = {
    START: 'start',
    MESSAGE: 'message',
    CONDITION: 'condition',
    INPUT: 'input',
    ACTION: 'action',
    DELAY: 'delay',
    ESCALATE: 'escalate',
    END: 'end'
};

/**
 * Condition operators
 */
export const OPERATORS = {
    CONTAINS: 'contains',
    NOT_CONTAINS: 'not_contains',
    EQUALS: 'equals',
    NOT_EQUALS: 'not_equals',
    GREATER_THAN: 'greater_than',
    LESS_THAN: 'less_than',
    MATCHES_REGEX: 'matches_regex',
    IS_EMPTY: 'is_empty',
    HAS_INTENT: 'has_intent'
};

/**
 * Get applicable flow for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Current context
 */
export async function getApplicableFlow(conversationId, context = {}) {
    try {
        const db = getSupabase();

        const { trigger = 'manual', pageId = null, goalType = null } = context;

        // Build query for active flows
        let query = db
            .from('ai_flows')
            .select('*')
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (pageId) {
            query = query.or(`page_id.eq.${pageId},page_id.is.null`);
        }

        const { data: flows, error } = await query;

        if (error) throw error;

        if (!flows || flows.length === 0) {
            return null;
        }

        // Find matching flow based on trigger
        for (const flow of flows) {
            if (await flowMatchesTrigger(flow, trigger, context)) {
                return flow;
            }
        }

        return null;

    } catch (error) {
        console.error('[FLOW] Error getting applicable flow:', error);
        return null;
    }
}

/**
 * Check if a flow matches the trigger conditions
 */
async function flowMatchesTrigger(flow, trigger, context) {
    if (flow.trigger_type !== trigger) {
        // Check for fallback triggers
        if (trigger === 'message' && flow.trigger_type === 'keyword') {
            // Check if message contains keywords
            const keywords = flow.trigger_config?.keywords || [];
            const message = (context.lastMessage || '').toLowerCase();
            return keywords.some(kw => message.includes(kw.toLowerCase()));
        }
        return false;
    }

    // Specific trigger checks
    switch (flow.trigger_type) {
        case 'keyword':
            const keywords = flow.trigger_config?.keywords || [];
            const message = (context.lastMessage || '').toLowerCase();
            return keywords.some(kw => message.includes(kw.toLowerCase()));

        case 'tag':
            const tagId = flow.trigger_config?.tag_id;
            return context.tags?.includes(tagId);

        case 'goal':
            return flow.trigger_config?.goal_type === context.goalType;

        case 'new_conversation':
            return context.isNewConversation;

        case 'silence':
            const silenceHours = flow.trigger_config?.silence_hours || 24;
            return context.hoursSinceLastMessage >= silenceHours;

        case 'manual':
            return true;

        default:
            return true;
    }
}

/**
 * Parse and validate a flow definition
 * @param {Object} flowJSON - Flow definition JSON
 */
export function parseFlowDefinition(flowJSON) {
    if (!flowJSON || !flowJSON.nodes) {
        return { valid: false, error: 'Missing nodes in flow definition' };
    }

    const nodes = flowJSON.nodes;
    const startNodes = nodes.filter(n => n.type === NODE_TYPES.START);

    if (startNodes.length === 0) {
        return { valid: false, error: 'Flow must have a start node' };
    }

    if (startNodes.length > 1) {
        return { valid: false, error: 'Flow can only have one start node' };
    }

    // Validate node connections
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const node of nodes) {
        if (node.next && !nodeIds.has(node.next)) {
            return { valid: false, error: `Invalid next reference: ${node.next}` };
        }
        if (node.branches) {
            for (const branch of node.branches) {
                if (branch.next && !nodeIds.has(branch.next)) {
                    return { valid: false, error: `Invalid branch reference: ${branch.next}` };
                }
            }
        }
    }

    return {
        valid: true,
        startNode: startNodes[0],
        nodeCount: nodes.length,
        nodes: new Map(nodes.map(n => [n.id, n]))
    };
}

/**
 * Execute a flow from a specific node
 * @param {Object} flow - Flow object
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Execution context
 */
export async function executeFlow(flow, conversationId, context = {}) {
    try {
        const parsed = parseFlowDefinition(flow.flow_definition);

        if (!parsed.valid) {
            throw new Error(parsed.error);
        }

        const { startNode, nodes } = parsed;
        const {
            startNodeId = startNode.id,
            message = null,
            maxIterations = 20
        } = context;

        let currentNodeId = startNodeId;
        let iterations = 0;
        const results = [];
        const visitedNodes = new Set();

        while (currentNodeId && iterations < maxIterations) {
            // Prevent infinite loops
            if (visitedNodes.has(currentNodeId)) {
                console.warn('[FLOW] Detected loop, breaking');
                break;
            }
            visitedNodes.add(currentNodeId);

            const node = nodes.get(currentNodeId);
            if (!node) {
                throw new Error(`Node not found: ${currentNodeId}`);
            }

            const result = await executeFlowNode(node, conversationId, {
                ...context,
                message,
                flow
            });

            results.push({
                nodeId: currentNodeId,
                nodeType: node.type,
                result
            });

            // Handle special result actions
            if (result.stop) {
                break;
            }

            if (result.escalate) {
                await escalateToHuman(conversationId, result.escalateReason || 'Flow escalation');
                break;
            }

            // Determine next node
            if (result.nextNodeId) {
                currentNodeId = result.nextNodeId;
            } else if (node.next) {
                currentNodeId = node.next;
            } else {
                break;
            }

            iterations++;
        }

        // Log flow execution
        await logSafetyEvent({
            conversationId,
            actionType: 'flow_completed',
            data: {
                flowId: flow.id,
                flowName: flow.name,
                nodesExecuted: results.length
            },
            explanation: `Flow "${flow.name}" executed with ${results.length} nodes`,
            flowId: flow.id
        });

        return {
            success: true,
            results,
            nodesExecuted: results.length
        };

    } catch (error) {
        console.error('[FLOW] Execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute a single flow node
 * @param {Object} node - Node to execute
 * @param {string} conversationId - Conversation ID
 * @param {Object} context - Execution context
 */
export async function executeFlowNode(node, conversationId, context = {}) {
    switch (node.type) {
        case NODE_TYPES.START:
            return { success: true, nextNodeId: node.next };

        case NODE_TYPES.MESSAGE:
            return await executeMessageNode(node, conversationId, context);

        case NODE_TYPES.CONDITION:
            return await executeConditionNode(node, context);

        case NODE_TYPES.INPUT:
            return await executeInputNode(node, context);

        case NODE_TYPES.ACTION:
            return await executeActionNode(node, conversationId, context);

        case NODE_TYPES.DELAY:
            return await executeDelayNode(node, context);

        case NODE_TYPES.ESCALATE:
            return { success: true, escalate: true, escalateReason: node.reason };

        case NODE_TYPES.END:
            return { success: true, stop: true };

        default:
            return { success: false, error: `Unknown node type: ${node.type}` };
    }
}

/**
 * Execute a message node
 */
async function executeMessageNode(node, conversationId, context) {
    let messageText = node.message || '';

    // Variable substitution
    messageText = substituteVariables(messageText, context);

    // Allow improvisation if enabled
    if (context.flow?.allow_improvisation && node.allowImprovisation) {
        messageText = await improveMessage(messageText, context);
    }

    return {
        success: true,
        type: 'message',
        message: messageText,
        nextNodeId: node.next
    };
}

/**
 * Execute a condition node
 */
async function executeConditionNode(node, context) {
    const { field, operator, value, branches } = node;

    // Get field value from context
    const fieldValue = getFieldValue(field, context);

    // Evaluate condition
    let conditionMet = evaluateCondition(fieldValue, operator, value);

    // Find matching branch
    if (branches && branches.length > 0) {
        for (const branch of branches) {
            const branchMet = evaluateCondition(
                getFieldValue(branch.field || field, context),
                branch.operator || operator,
                branch.value
            );

            if (branchMet) {
                return { success: true, nextNodeId: branch.next };
            }
        }

        // Use default branch if no match
        const defaultBranch = branches.find(b => b.isDefault);
        if (defaultBranch) {
            return { success: true, nextNodeId: defaultBranch.next };
        }
    }

    return {
        success: true,
        nextNodeId: conditionMet ? node.trueBranch : node.falseBranch
    };
}

/**
 * Execute an input node (waits for user input)
 */
async function executeInputNode(node, context) {
    // Check if we have user input
    if (context.message) {
        // Validate input if required
        if (node.validation) {
            const isValid = validateInput(context.message, node.validation);
            if (!isValid) {
                return {
                    success: true,
                    type: 'message',
                    message: node.validationError || 'Please provide a valid response.',
                    nextNodeId: node.id // Stay on same node
                };
            }
        }

        // Store input in context
        if (node.storeAs) {
            context[node.storeAs] = context.message;
        }

        return { success: true, nextNodeId: node.next };
    }

    // No input yet, prompt and wait
    return {
        success: true,
        type: 'message',
        message: node.prompt || 'Please respond to continue.',
        waitForInput: true,
        stop: true // Stop execution until input received
    };
}

/**
 * Execute an action node
 */
async function executeActionNode(node, conversationId, context) {
    const { action, params } = node;

    switch (action) {
        case 'set_goal':
            // Would call goalController.setConversationGoal
            return { success: true, nextNodeId: node.next, actionPerformed: 'set_goal' };

        case 'schedule_followup':
            // Would call followUpScheduler.scheduleFollowUp
            return { success: true, nextNodeId: node.next, actionPerformed: 'schedule_followup' };

        case 'add_tag':
            // Would add tag to conversation
            return { success: true, nextNodeId: node.next, actionPerformed: 'add_tag' };

        case 'human_takeover':
            return { success: true, escalate: true, escalateReason: params?.reason };

        default:
            return { success: true, nextNodeId: node.next };
    }
}

/**
 * Execute a delay node
 */
async function executeDelayNode(node, context) {
    const delayMs = (node.delaySeconds || 0) * 1000;

    return {
        success: true,
        delay: delayMs,
        nextNodeId: node.next
    };
}

/**
 * Substitute variables in message text
 */
function substituteVariables(text, context) {
    const variables = {
        '{{name}}': context.participantName || 'there',
        '{{firstName}}': (context.participantName || 'there').split(' ')[0],
        '{{business}}': context.businessName || 'your business',
        '{{date}}': new Date().toLocaleDateString(),
        '{{time}}': new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    let result = text;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(key, 'g'), value);
    }

    return result;
}

/**
 * Get field value from context
 */
function getFieldValue(field, context) {
    const fieldMap = {
        'message': context.message || '',
        'message_lower': (context.message || '').toLowerCase(),
        'participant_name': context.participantName || '',
        'hours_since_last': context.hoursSinceLastMessage || 0,
        'message_count': context.messageCount || 0,
        'goal_type': context.goalType || null,
        'has_booking': context.hasBooking || false,
        'sentiment': context.sentiment || 'neutral'
    };

    return fieldMap[field] ?? context[field] ?? '';
}

/**
 * Evaluate a condition
 */
function evaluateCondition(fieldValue, operator, compareValue) {
    switch (operator) {
        case OPERATORS.CONTAINS:
            return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());

        case OPERATORS.NOT_CONTAINS:
            return !String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());

        case OPERATORS.EQUALS:
            return fieldValue == compareValue;

        case OPERATORS.NOT_EQUALS:
            return fieldValue != compareValue;

        case OPERATORS.GREATER_THAN:
            return Number(fieldValue) > Number(compareValue);

        case OPERATORS.LESS_THAN:
            return Number(fieldValue) < Number(compareValue);

        case OPERATORS.MATCHES_REGEX:
            try {
                return new RegExp(compareValue, 'i').test(String(fieldValue));
            } catch {
                return false;
            }

        case OPERATORS.IS_EMPTY:
            return !fieldValue || fieldValue === '';

        case OPERATORS.HAS_INTENT:
            // Would use AI to detect intent
            return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());

        default:
            return false;
    }
}

/**
 * Validate user input
 */
function validateInput(input, validation) {
    if (!input) return false;

    switch (validation.type) {
        case 'email':
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
        case 'phone':
            return /^\+?[\d\s-]{10,}$/.test(input);
        case 'number':
            return !isNaN(Number(input));
        case 'yesno':
            return /^(yes|no|y|n)$/i.test(input.trim());
        case 'regex':
            try {
                return new RegExp(validation.pattern).test(input);
            } catch {
                return false;
            }
        default:
            return input.length >= (validation.minLength || 0);
    }
}

/**
 * Allow controlled improvisation on a message
 */
async function improveMessage(message, context) {
    const boundary = context.flow?.improvisation_boundary ||
        'Make the message more natural while keeping the same intent and information.';

    try {
        const improved = await nvidiaChat([
            {
                role: 'system',
                content: `You are improving a chatbot message. Guidelines: ${boundary}. Keep changes minimal. Return only the improved message.`
            },
            {
                role: 'user',
                content: `Original: "${message}"\n\nContext: Speaking to ${context.participantName || 'customer'}`
            }
        ], { temperature: 0.4, maxTokens: 256 });

        return improved || message;
    } catch {
        return message;
    }
}

/**
 * Escalate conversation to human
 */
export async function escalateToHuman(conversationId, reason) {
    await activateHumanTakeover(conversationId, 'escalation', {
        triggeredBy: 'system',
        reasonDetail: reason
    });

    await logSafetyEvent({
        conversationId,
        actionType: 'flow_escalated',
        data: { reason },
        explanation: `Flow escalated to human: ${reason}`
    });
}

/**
 * Create a new flow
 */
export async function createFlow(flowData, userId = null) {
    try {
        const db = getSupabase();

        const { data: flow, error } = await db
            .from('ai_flows')
            .insert({
                ...flowData,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, flow };

    } catch (error) {
        console.error('[FLOW] Error creating flow:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all flows
 */
export async function getFlows(pageId = null) {
    try {
        const db = getSupabase();

        let query = db
            .from('ai_flows')
            .select('*')
            .order('priority', { ascending: false });

        if (pageId) {
            query = query.or(`page_id.eq.${pageId},page_id.is.null`);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[FLOW] Error getting flows:', error);
        return [];
    }
}

/**
 * Toggle flow active status
 */
export async function toggleFlowActive(flowId, isActive) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('ai_flows')
            .update({
                is_active: isActive,
                updated_at: new Date().toISOString()
            })
            .eq('id', flowId);

        if (error) throw error;
        return { success: true };

    } catch (error) {
        console.error('[FLOW] Error toggling flow:', error);
        return { success: false, error: error.message };
    }
}

export default {
    NODE_TYPES,
    OPERATORS,
    getApplicableFlow,
    parseFlowDefinition,
    executeFlow,
    executeFlowNode,
    escalateToHuman,
    createFlow,
    getFlows,
    toggleFlowActive
};
