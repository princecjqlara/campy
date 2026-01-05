/**
 * Facebook Webhook Handler
 * Handles webhook verification and incoming messages
 */

export default function handler(req, res) {
    // Handle GET request - Webhook Verification
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook verified successfully');
            return res.status(200).send(challenge);
        } else {
            console.error('Webhook verification failed', { mode, token, expectedToken: VERIFY_TOKEN });
            return res.status(403).json({ error: 'Verification failed' });
        }
    }

    // Handle POST request - Incoming Messages
    if (req.method === 'POST') {
        const body = req.body;

        console.log('Webhook received:', JSON.stringify(body, null, 2));

        // Verify it's a page subscription
        if (body.object === 'page') {
            // Process each entry
            body.entry?.forEach(entry => {
                // Get the messaging events
                const messagingEvents = entry.messaging || [];

                messagingEvents.forEach(event => {
                    const senderId = event.sender?.id;
                    const pageId = event.recipient?.id;
                    const timestamp = event.timestamp;

                    if (event.message) {
                        // Handle incoming message
                        console.log('New message from:', senderId, 'Text:', event.message.text);

                        // TODO: Store message in database
                        // TODO: Trigger AI analysis
                    }

                    if (event.postback) {
                        // Handle postback
                        console.log('Postback from:', senderId, 'Payload:', event.postback.payload);
                    }
                });
            });

            // Return 200 OK immediately to acknowledge receipt
            return res.status(200).json({ status: 'EVENT_RECEIVED' });
        }

        return res.status(404).json({ error: 'Unknown object type' });
    }

    // Handle other methods
    return res.status(405).json({ error: 'Method not allowed' });
}
