// Default package prices (fallback if settings not loaded)
const defaultPackages = {
  basic: { name: 'Basic', emoji: '🟢', price: 1799 },
  star: { name: 'Star', emoji: '⭐', price: 2999 },
  fire: { name: 'Fire', emoji: '🔥', price: 3499 },
  crown: { name: 'Crown', emoji: '👑', price: 5799 },
  custom: { name: 'Custom', emoji: '🎨', price: 0 }
};

// Get package prices from settings or use defaults (called dynamically)
const getPackagePrices = () => {
  try {
    const stored = localStorage.getItem('campy_package_prices');
    if (stored) {
      const prices = JSON.parse(stored);
      return {
        basic: { ...defaultPackages.basic, price: prices.basic || defaultPackages.basic.price },
        star: { ...defaultPackages.star, price: prices.star || defaultPackages.star.price },
        fire: { ...defaultPackages.fire, price: prices.fire || defaultPackages.fire.price },
        crown: { ...defaultPackages.crown, price: prices.crown || defaultPackages.crown.price },
        custom: { ...defaultPackages.custom, price: prices.custom || defaultPackages.custom.price }
      };
    }
  } catch (e) {
    console.error('Error loading package prices:', e);
  }
  return defaultPackages;
};

// Export packages as a getter function to always get current prices
export const getPackages = () => getPackagePrices();

// For backward compatibility, export a computed object
export const packages = getPackagePrices();

export const getPackageInfo = (client) => {
  if (client.package === 'custom' && client.customPackage) {
    return {
      ...client.customPackage,
      name: 'Custom',
      emoji: '🎨'
    };
  }
  const currentPackages = getPackagePrices();
  return currentPackages[client.package] || currentPackages.basic;
};

export const getPackagePrice = (client) => {
  const pkg = getPackageInfo(client);
  return pkg.price || 0;
};

export const formatPrice = (price) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0
  }).format(price);
};

