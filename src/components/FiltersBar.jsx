import React from 'react';

const FiltersBar = ({
  searchTerm,
  onSearchChange,
  filterPhase,
  onPhaseFilterChange,
  filterPackage,
  onPackageFilterChange,
  filterPayment,
  onPaymentFilterChange
}) => {
  return (
    <section className="filters-bar">
      <div className="search-box">
        <input
          type="text"
          className="form-input"
          id="searchInput"
          placeholder="Search clients, businesses..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <select
        className="form-select filter-select"
        id="filterPhase"
        value={filterPhase}
        onChange={(e) => onPhaseFilterChange(e.target.value)}
      >
        <option value="">All Phases</option>
        <option value="proposal-sent">📧 Proposal Sent</option>
        <option value="booked">Booked</option>
        <option value="preparing">Preparing</option>
        <option value="testing">Testing</option>
        <option value="running">Running</option>
      </select>
      <select
        className="form-select filter-select"
        id="filterPackage"
        value={filterPackage}
        onChange={(e) => onPackageFilterChange(e.target.value)}
      >
        <option value="">All Packages</option>
        <option value="basic">🟢 ₱1,799</option>
        <option value="star">⭐ ₱2,999</option>
        <option value="fire">🔥 ₱3,499</option>
        <option value="crown">👑 ₱5,799</option>
        <option value="custom">🎨 Custom</option>
      </select>
      <select
        className="form-select filter-select"
        id="filterPayment"
        value={filterPayment}
        onChange={(e) => onPaymentFilterChange(e.target.value)}
      >
        <option value="">All Payment Status</option>
        <option value="paid">Paid</option>
        <option value="unpaid">Unpaid</option>
        <option value="partial">Partial</option>
      </select>
    </section>
  );
};

export default FiltersBar;

