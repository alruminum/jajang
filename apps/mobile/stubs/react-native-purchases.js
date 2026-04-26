// Stub for react-native-purchases (RevenueCat) — V1 데모 빌드용.
// 실제 출시 시 alias 제거하고 native module 사용.

const noop = () => {};
const noopAsync = async () => {};

const LOG_LEVEL = { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };

const PURCHASES_ERROR_CODE = {
  UNKNOWN_ERROR: '0',
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PURCHASE_INVALID_ERROR: '4',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  RECEIPT_ALREADY_IN_USE_ERROR: '7',
  INVALID_RECEIPT_ERROR: '8',
  MISSING_RECEIPT_FILE_ERROR: '9',
  NETWORK_ERROR: '10',
};

const emptyCustomerInfo = {
  entitlements: { active: {}, all: {} },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  managementURL: null,
  originalAppUserId: 'stub',
  originalApplicationVersion: null,
  originalPurchaseDate: null,
  firstSeen: new Date().toISOString(),
  requestDate: new Date().toISOString(),
  latestExpirationDate: null,
  nonSubscriptionTransactions: [],
};

const Purchases = {
  setLogLevel: noop,
  configure: noop,
  logIn: async () => ({ customerInfo: emptyCustomerInfo, created: false }),
  logOut: async () => emptyCustomerInfo,
  getCustomerInfo: async () => emptyCustomerInfo,
  getOfferings: async () => ({ current: null, all: {} }),
  purchasePackage: async () => ({ customerInfo: emptyCustomerInfo, productIdentifier: 'stub' }),
  restorePurchases: async () => emptyCustomerInfo,
  addCustomerInfoUpdateListener: noop,
  removeCustomerInfoUpdateListener: noop,
};

module.exports = Purchases;
module.exports.default = Purchases;
module.exports.LOG_LEVEL = LOG_LEVEL;
module.exports.PURCHASES_ERROR_CODE = PURCHASES_ERROR_CODE;
