import React from 'react';

const ServiceSelector = ({ services, activeIndex, onSelectService }) => {
    if (!services || services.length <= 1) return null;

    return (
        <div className="service-selector">
            <h4>Select Schedule Type</h4>
            <div className="service-tabs">
                {services.map((s, index) => (
                    <button
                        key={s.service_id}
                        className={`tab-btn ${index === activeIndex ? 'active' : ''}`}
                        onClick={() => onSelectService(index)}
                    >
                        {s.service_id} ({s.days.join(', ')})
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ServiceSelector;
