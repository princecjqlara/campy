import React from 'react';

const Header = ({ role, currentUserName, onUserNameChange, onRoleChange, onThemeToggle, onAddClient, onAdminSettings, onNotifications, onReports, onCalendar, onTeamPerformance, onLogout, isOnlineMode, currentUserEmail, unreadNotificationCount = 0 }) => {
  return (
    <header className="app-header">
      <div className="app-logo">
        <span style={{ fontSize: '2rem' }}>🏢</span>
        <h1>CAMPY</h1>
      </div>
      <div className="header-actions">
        {isOnlineMode && currentUserEmail && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginRight: '0.5rem' }}>
            {currentUserEmail}
          </span>
        )}
        {!isOnlineMode && (
          <div className="role-selector">
            <select 
              className="form-select" 
              id="roleSelector" 
              style={{ minWidth: '120px' }}
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
            >
              <option value="user">👤 User</option>
              <option value="admin">👑 Admin</option>
            </select>
          </div>
        )}
        <input
          type="text"
          className="form-input user-only"
          id="currentUserName"
          placeholder="Your Name"
          style={{ width: '120px' }}
          value={currentUserName}
          onChange={(e) => onUserNameChange(e.target.value)}
          disabled={isOnlineMode}
        />
        <button 
          className="btn btn-secondary admin-only" 
          id="adminSettingsBtn" 
          title="Expense Settings"
          onClick={onAdminSettings}
        >
          ⚙️ Settings
        </button>
        {onReports && (
          <button 
            className="btn btn-secondary admin-only" 
            id="reportsBtn"
            title="Reports & Analytics"
            onClick={onReports}
          >
            📊 Reports
          </button>
        )}
        {onTeamPerformance && (
          <button 
            className="btn btn-secondary admin-only" 
            id="teamPerformanceBtn"
            title="Team Performance & Leaderboard"
            onClick={onTeamPerformance}
          >
            🏆 Team Performance
          </button>
        )}
        {onCalendar && (
          <button 
            className="btn btn-secondary" 
            id="calendarBtn"
            title="Calendar View"
            onClick={onCalendar}
          >
            📅 Calendar
          </button>
        )}
        {isOnlineMode && (
          <button 
            className="btn btn-secondary" 
            id="notificationsBtn"
            title="Notifications"
            onClick={onNotifications}
            style={{ position: 'relative' }}
          >
            🔔
            {unreadNotificationCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: 'var(--error)',
                color: 'white',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 'bold'
              }}>
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>
        )}
        <button 
          className="btn btn-primary" 
          id="addClientBtn"
          onClick={onAddClient}
        >
          <span>➕</span> Add Client
        </button>
        {isOnlineMode && (
          <button 
            className="btn btn-secondary" 
            id="logoutBtn"
            title="Sign Out"
            onClick={onLogout}
            style={{ marginLeft: '0.5rem' }}
          >
            🚪 Logout
          </button>
        )}
        <button 
          className="theme-toggle" 
          id="themeToggle" 
          title="Toggle Theme"
          onClick={onThemeToggle}
        >
          🌙
        </button>
      </div>
    </header>
  );
};

export default Header;

