import Integration from './../Integration';
import { getProp, setProp } from 'driveback-utils/dotProp';
import deleteProperty from 'driveback-utils/deleteProperty';
import cleanObject from 'driveback-utils/cleanObject';
import isEmpty from 'driveback-utils/isEmpty';
import {
  VIEWED_PAGE,
  LOGGED_IN,
  REGISTERED,
  SUBSCRIBED,
  UPDATED_PROFILE_INFO,
  VIEWED_PRODUCT_DETAIL,
  VIEWED_PRODUCT_LISTING,
  ADDED_PRODUCT,
  REMOVED_PRODUCT,
  COMPLETED_TRANSACTION,
} from './../events/semanticEvents';
import {
  getEnrichableVariableMappingProps,
  extractVariableMappingValues,
} from './../IntegrationUtils';

const PROVIDER_USER_ID = 'userId';
const PROVIDER_EMAIL = 'email';

const V2 = 'V2';
const V3 = 'V3';

const DEFAULT_CUSTOMER_FIELDS = [
  'firstName',
  'lastName',
  'middleName',
  'fullName',
  'mobilePhone',
  'email',
  'birthDate',
  'sex',
];

class Mindbox extends Integration {
  constructor(digitalData, options) {
    const optionsWithDefaults = Object.assign({
      apiVersion: V2,
      projectSystemName: '',
      brandSystemName: '',
      pointOfContactSystemName: '',
      projectDomain: '',
      operationMapping: {},
      setCartOperation: '',
      userVars: {},
      productVars: {},
      userIdProvider: undefined,
      productIdsMapping: {},
      productSkuIdsMapping: {},
      productCategoryIdsMapping: {},
      customerIdsMapping: {},
    }, options);

    super(digitalData, optionsWithDefaults);

    this.SEMANTIC_EVENTS = [
      VIEWED_PAGE,
      LOGGED_IN,
      REGISTERED,
      SUBSCRIBED,
      UPDATED_PROFILE_INFO,
      VIEWED_PRODUCT_DETAIL,
      VIEWED_PRODUCT_LISTING,
      ADDED_PRODUCT,
      REMOVED_PRODUCT,
      COMPLETED_TRANSACTION,
    ];

    this.operationEvents = Object.keys(this.getOption('operationMapping'));
    this.operationEvents.forEach((operationEvent) => {
      if (this.SEMANTIC_EVENTS.indexOf(operationEvent) < 0) {
        this.SEMANTIC_EVENTS.push(operationEvent);
      }
    });

    this.addTag({
      type: 'script',
      attr: {
        id: 'mindbox',
        src: '//api.mindbox.ru/scripts/v1/tracker.js',
      },
    });
  }

  initialize() {
    this.prepareEnrichableUserProps();
    this.prepareEnrichableUserIds();

    window.mindbox = window.mindbox || function mindboxStub() {
      window.mindbox.queue.push(arguments);
    };
    window.mindbox.queue = window.mindbox.queue || [];

    window.mindbox('create', {
      projectSystemName: this.getOption('projectSystemName'),
      brandSystemName: this.getOption('brandSystemName'),
      pointOfContactSystemName: this.getOption('pointOfContactSystemName'),
      projectDomain: this.getOption('projectDomain'),
    });
  }

  getSemanticEvents() {
    return this.SEMANTIC_EVENTS;
  }

  prepareEnrichableUserProps() {
    this.enrichableUserProps = getEnrichableVariableMappingProps(this.getOption('userVars'));
  }

  prepareEnrichableUserIds() {
    this.enrichableUserIds = getEnrichableVariableMappingProps(this.getOption('customerIdsMapping'));
  }

  getEnrichableEventProps(event) {
    let enrichableProps = [];
    switch (event.name) {
      case VIEWED_PAGE:
        enrichableProps = [
          ...this.getEnrichableUserIds(),
          'cart',
        ];
        break;
      case LOGGED_IN:
      case REGISTERED:
      case SUBSCRIBED:
      case UPDATED_PROFILE_INFO:
        enrichableProps = [
          ...this.getEnrichableUserIds(),
          ...this.getEnrichableUserProps(),
          'user.userId', // might be duplicated
          'user.isSubscribed',
        ];
        break;
      case COMPLETED_TRANSACTION:
        enrichableProps = this.getEnrichableUserProps();
        enrichableProps.push('user.userId');
        enrichableProps.push('transaction');
        break;
      case VIEWED_PRODUCT_DETAIL:
        enrichableProps = ['product'];
        break;
      case VIEWED_PRODUCT_LISTING:
        enrichableProps = ['listing.categoryId'];
        break;
      default:
      // do nothing
    }

    return enrichableProps;
  }

  getEventValidationConfig(event) {
    let viewedPageFields = [];
    let viewedPageValidations = {};

    const setCartOperation = this.getOption('setCartOperation');
    if (setCartOperation) {
      viewedPageFields = [
        'cart.lineItems[].product.id',
        'cart.lineItems[].product.unitSalePrice',
        'cart.lineItems[].quantity',
      ];
      viewedPageValidations = {
        'cart.lineItems[].product.id': {
          errors: ['required'],
          warnings: ['string'],
        },
        'cart.lineItems[].product.unitSalePrice': {
          errors: ['required'],
          warnings: ['numeric'],
        },
        'cart.lineItems[].quantity': {
          errors: ['required'],
          warnings: ['numeric'],
        },
      };
    }

    const userFields = [...this.getEnrichableUserProps(), 'user.userId', 'user.isSubscribed'];

    const addRemoveProductFields = [
      'product.id',
      'product.unitSalePrice',
    ];
    const addRemoveProductValidations = {
      'product.id': {
        errors: ['required'],
        warnings: ['string'],
      },
      'product.unitSalePrice': {
        errors: ['required'],
        warnings: ['numeric'],
      },
    };

    const config = {
      [VIEWED_PAGE]: {
        fields: viewedPageFields,
        validations: viewedPageValidations,
      },
      [REGISTERED]: {
        fields: userFields,
      },
      [SUBSCRIBED]: {
        fields: userFields,
      },
      [UPDATED_PROFILE_INFO]: {
        fields: userFields,
      },
      [LOGGED_IN]: {
        fields: userFields,
      },
      [VIEWED_PRODUCT_DETAIL]: {
        fields: ['product.id'],
        validation: {
          'product.id': {
            errors: ['required'],
            warnings: ['string'],
          },
        },
      },
      [VIEWED_PRODUCT_LISTING]: {
        fields: ['listing.categoryId'],
        validations: {
          'listing.categoryId': {
            errors: ['required'],
            warnings: ['string'],
          },
        },
      },
      [ADDED_PRODUCT]: {
        fields: addRemoveProductFields,
        validations: addRemoveProductValidations,
      },
      [REMOVED_PRODUCT]: {
        fields: addRemoveProductFields,
        validations: addRemoveProductValidations,
      },
      [COMPLETED_TRANSACTION]: {
        fields: [
          ...userFields,
          'transaction.orderId',
          'transaction.total',
          'transaction.shippingMethod',
          'transaction.paymentMethod',
          'transaction.lineItems[].product.id',
          'transaction.lineItems[].product.unitSalePrice',
          'transaction.lineItems[].quantity',
        ],
        validations: {
          'transaction.orderId': {
            errors: ['required'],
            warnings: ['string'],
          },
          'transaction.total': {
            errors: ['required'],
            warnings: ['numeric'],
          },
          'transaction.shippingMethod': {
            warnings: ['required', 'string'],
          },
          'transaction.paymentMethod': {
            warnings: ['required', 'string'],
          },
          'transaction.lineItems[].product.id': {
            errors: ['required'],
            warnings: ['string'],
          },
          'transaction.lineItems[].product.unitSalePrice': {
            errors: ['required'],
            warnings: ['numeric'],
          },
          'transaction.lineItems[].quantity': {
            errors: ['required'],
            warnings: ['numeric'],
          },
        },
      },
    };

    return config[event.name];
  }

  getEnrichableUserProps() {
    return this.enrichableUserProps;
  }

  getEnrichableUserIds() {
    return this.enrichableUserIds;
  }

  isLoaded() {
    return window.mindboxInitialized;
  }

  getOperationName(eventName) {
    return this.getOption('operationMapping')[eventName];
  }

  getIdentificator(event, priorityProvider) {
    let identificator;
    // identify by userId
    if (this.getOption('userIdProvider')) {
      const userId = getProp(event, 'user.userId');
      if (userId) {
        identificator = {
          provider: this.getOption('userIdProvider'),
          identity: userId,
        };
        if (!priorityProvider || priorityProvider === PROVIDER_USER_ID) {
          return identificator;
        }
      }
    }

    // identify by email
    const email = getProp(event, 'user.email');
    if (email) {
      identificator = {
        provider: 'email',
        identity: email,
      };
    }
    if (identificator && (!priorityProvider || priorityProvider === PROVIDER_EMAIL)) {
      return identificator;
    }

    // identify by mobilePhone
    const phone = getProp(event, 'user.phone');
    if (phone) {
      return {
        provider: 'mobilePhone',
        identity: phone,
      };
    }

    return null;
  }

  getCustomerData(event) {
    const userVars = this.getOption('userVars');
    const userData = extractVariableMappingValues(event, userVars);
    if (this.getOption('apiVersion') === V3) {
      userData.ids = this.getCustomerIds(event);
      const keys = Object.keys(userData);
      keys.reduce((acc, key) => {
        if (DEFAULT_CUSTOMER_FIELDS.indexOf(key) < 0) {
          setProp(userData, `customFields.${key}`);
          deleteProperty(userData, key);
        }
        return userData;
      }, userData);
    }
    return userData;
  }

  getProductCustoms(product) {
    const productVars = this.getOption('productVars');
    const customs = {};
    Object.keys(productVars).forEach((key) => {
      const customVal = getProp(product, productVars[key]);
      if (customVal) customs[key] = customVal;
    });
    return customs;
  }

  getProductIds(product) {
    const mapping = this.getOption('productIdsMapping');
    const productIds = extractVariableMappingValues(product, mapping);
    return (!isEmpty(productIds)) ? productIds : undefined;  
  }

  getProductSkuIds(product) {
    const mapping = this.getOption('productSkuIdsMapping');
    const productSkuIds = extractVariableMappingValues(product, mapping);
    return (!isEmpty(productSkuIds)) ? productSkuIds : undefined;  
  }

  getProductCategoryIds(event) {
    const mapping = this.getOption('productCategoryIdsMapping');
    const categoryIds = extractVariableMappingValues(event, mapping);
    return (!isEmpty(categoryIds)) ? categoryIds : undefined;
  }

  getCustomerIds(event) {
    const mapping = this.getOption('customerIdsMapping');
    const customerIds = extractVariableMappingValues(event, mapping);
    return (!isEmpty(customerIds)) ? customerIds : undefined;
  }

  getV3Product(product) {
    const skuIds = this.getProductSkuIds(product);
    return {
      ids: this.getProductIds(product),
      sku: (skuIds) ? { ids: skuIds } : undefined,
    };
  }

  getV3ProductList(lineItems) {
    return lineItems.map((lineItem) => {
      const product = this.getV3Product(lineItem.product);
      const count = lineItem.quantity || 1;
      return {
        product,
        count,
        price: lineItem.subtotal || count * getProp(lineItem, 'product.unitSalePrice'),
      };
    });
  }

  trackEvent(event) {
    const eventMap = {
      [VIEWED_PAGE]: this.onViewedPage.bind(this),
      [VIEWED_PRODUCT_DETAIL]: this.onViewedProductDetail.bind(this),
      [VIEWED_PRODUCT_LISTING]: this.onViewedProductListing.bind(this),
      [ADDED_PRODUCT]: this.onAddedProduct.bind(this),
      [REMOVED_PRODUCT]: this.onRemovedProduct.bind(this),
      [LOGGED_IN]: this.onLoggedIn.bind(this),
      [REGISTERED]: this.onRegistered.bind(this),
      [SUBSCRIBED]: this.onSubscribed.bind(this),
      [UPDATED_PROFILE_INFO]: this.onUpdatedProfileInfo.bind(this),
      [COMPLETED_TRANSACTION]: this.onCompletedTransaction.bind(this),
    };
    // get operation name either from email or from integration settings
    const operation = event.operation ||
      getProp(event, 'integrations.mindbox.operation') ||
      this.getOperationName(event.name);

    if (!operation && event.name !== VIEWED_PAGE) return;

    if (eventMap[event.name]) {
      eventMap[event.name](event, operation);
    } else {
      this.onCustomEvent(event, operation);
    }
  }

  setCart(event, operation) {
    const cart = event.cart || {};
    const lineItems = cart.lineItems;
    if (!lineItems || !lineItems.length) {
      return;
    }

    if (this.getOption('apiVersion') === V3) {
      const customerIds = this.getCustomerIds(event);
      let customer;
      if (customerIds) {
        customer = { ids: customerIds };
      }
      window.mindbox('async', cleanObject({
        operation,
        data: {
          customer,
          productList: this.getV3ProductList(lineItems),
        },
      }));
    } else {
      window.mindbox('performOperation', {
        operation,
        data: {
          action: {
            personalOffers: lineItems.map((lineItem) => {
              const quantity = lineItem.quantity || 1;
              return {
                productId: getProp(lineItem, 'product.id'),
                count: quantity,
                price: getProp(lineItem, 'product.unitSalePrice') * quantity,
                ...this.getProductCustoms(lineItem.product),
              };
            }),
          },
        },
      });
    }
  }

  onViewedPage(event) {
    const setCartOperation = this.getOption('setCartOperation');
    if (setCartOperation && event.cart) {
      this.setCart(event, setCartOperation);
    }
  }

  onLoggedIn(event, operation) {
    if (this.getOption('apiVersion') === V3) {
      const user = event.user || {};
      const customerIds = this.getCustomerIds(event);
      if (!customerIds) return;
      window.mindbox('async', {
        operation,
        data: {
          customer: cleanObject({
            ids: customerIds,
            email: getProp(user, 'email'),
            mobilePhone: getProp(user, 'phone'),
          }),
        },
      });
    } else {
      const identificator = this.getIdentificator(event);
      if (!identificator) return;
      const data = cleanObject(this.getCustomerData(event));
      window.mindbox('identify', {
        operation,
        identificator,
        data,
      });
    }
  }

  onRegistered(event, operation) {
    this.onUpdatedProfileInfo(event, operation);
  }

  onUpdatedProfileInfo(event, operation) {
    const identificator = this.getIdentificator(event);
    if (!identificator) return;

    const data = cleanObject(this.getCustomerData(event));
    if (getProp(event, 'user.isSubscribed')) {
      data.subscriptions = data.subscriptions || [];
      data.subscriptions.push({
        pointOfContact: 'Email',
        isSubscribed: true,
        valueByDefault: true,
      });
    }
    if (getProp(event, 'user.isSubscribedBySms')) {
      data.subscriptions = data.subscriptions || [];
      data.subscriptions.push({
        pointOfContact: 'Sms',
        isSubscribed: true,
        valueByDefault: true,
      });
    }
    window.mindbox('identify', {
      operation,
      identificator,
      data,
    });
  }

  onSubscribed(event, operation) {
    const user = event.user || {};
    const email = user.email;
    if (!email) return;

    const subscriptions = [
      cleanObject({
        pointOfContact: 'Email',
        topic: event.subscriptionList,
        isSubscribed: true,
        valueByDefault: true,
      }),
    ];

    if (this.getOption('apiVersion') === V3) {
      window.mindbox('async', {
        operation,
        data: {
          customer: { email, subscriptions },
        },
      });
    } else {
      const identificator = this.getIdentificator(event, PROVIDER_EMAIL);
      if (!identificator) return;
      const data = cleanObject(this.getCustomerData(event));
      data.subscriptions = subscriptions;
      window.mindbox('identify', { operation, identificator, data });
    }
  }

  onViewedProductDetail(event, operation) {
    const product = getProp(event, 'product') || {};
    if (!product.id) return;

    if (this.getOption('apiVersion') === V3) {
      const customerIds = this.getCustomerIds(event);
      let customer;
      if (customerIds) {
        customer = { ids: customerIds };
      }
      window.mindbox('async', cleanObject({
        operation,
        data: {
          customer,
          product: this.getV3Product(product),
        },
      }));
    } else {
      window.mindbox('performOperation', {
        operation,
        data: {
          action: {
            productId: product.id,
            ...this.getProductCustoms(product),
          },
        },
      });
    }
  }

  onViewedProductListing(event, operation) {
    if (this.getOption('apiVersion') === V3) {
      window.mindbox('async', {
        operation,
        data: {
          productCategory: {
            ids: this.getProductCategoryIds(event),
          },
        },
      });
    } else {
      const productCategoryId = getProp(event, 'listing.categoryId');
      if (!productCategoryId) return;
      window.mindbox('performOperation', {
        operation,
        data: {
          action: { productCategoryId },
        },
      });
    }
  }

  onAddedProduct(event, operation) {
    if (this.getOption('apiVersion') === V3) {
      this.onCustomEvent(event);
    } else {
      const product = getProp(event, 'product') || {};
      if (!product.id) return;
      window.mindbox('performOperation', {
        operation,
        data: {
          action: {
            productId: product.id,
            price: product.unitSalePrice,
            ...this.getProductCustoms(product),
          },
        },
      });
    }
  }

  onRemovedProduct(event, operation) {
    if (this.getOption('apiVersion') === V3) {
      this.onCustomEvent(event);
    } else {
      const product = getProp(event, 'product') || {};
      if (!product.id) return;
      window.mindbox('performOperation', {
        operation,
        data: {
          action: {
            productId: product.id,
            price: product.unitSalePrice,
            ...this.getProductCustoms(product),
          },
        },
      });
    }
  }

  onCompletedTransaction(event, operation) {
    const identificator = this.getIdentificator(event);
    if (!identificator) return;

    const orderId = getProp(event, 'transaction.orderId');
    if (!orderId) return;

    const lineItems = getProp(event, 'transaction.lineItems');
    let mindboxItems = [];
    if (lineItems && lineItems.length) {
      mindboxItems = lineItems.map(lineItem => cleanObject({
        productId: getProp(lineItem, 'product.id'),
        quantity: lineItem.quantity || 1,
        price: getProp(lineItem, 'product.unitSalePrice'),
        ...this.getProductCustoms(lineItem.product),
      }));
    }

    const data = this.getCustomerData(event);
    data.order = {
      webSiteId: orderId,
      price: getProp(event, 'transaction.total'),
      deliveryType: getProp(event, 'transaction.shippingMethod'),
      paymentType: getProp(event, 'transaction.paymentMethod'),
      items: mindboxItems,
    };

    window.mindbox('identify', cleanObject({
      operation,
      identificator,
      data,
    }));
  }

  onCustomEvent(event, operation) {
    let identificator;
    let data;
    if (event.user) {
      identificator = this.getIdentificator(event);
      data = this.getCustomerData(event);
    }
    window.mindbox('performOperation', cleanObject({
      operation,
      identificator,
      data,
    }));
  }
}

export default Mindbox;
