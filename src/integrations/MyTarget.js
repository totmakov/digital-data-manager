import Integration from './../Integration';
import deleteProperty from './../functions/deleteProperty';
import getVarValue from './../functions/getVarValue';
import {
  VIEWED_PAGE,
  VIEWED_PRODUCT_DETAIL,
  VIEWED_PRODUCT_LISTING,
  VIEWED_CART,
  COMPLETED_TRANSACTION,
} from './../events';

const SEMANTIC_EVENTS = [
  VIEWED_PAGE,
  VIEWED_PRODUCT_DETAIL,
  VIEWED_PRODUCT_LISTING,
  VIEWED_CART,
  COMPLETED_TRANSACTION,
];

function lineItemsToProductIds(lineItems) {
  const productIds = lineItems.filter((lineItem) => {
    return !!(lineItem.product.id);
  }).map((lineItem) => {
    return lineItem.product.id;
  });
  return productIds;
}

class MyTarget extends Integration {

  constructor(digitalData, options) {
    const optionsWithDefaults = Object.assign({
      counterId: '',
      listVar: {
        'type': 'constant',
        'value': '1',
      },
      noConflict: false,
    }, options);

    super(digitalData, optionsWithDefaults);

    this.addTag({
      type: 'script',
      attr: {
        id: 'topmailru-code',
        src: '//top-fwz1.mail.ru/js/code.js',
      },
    });
  }

  initialize() {
    window._tmr = window._tmr || [];
    if (!this.getOption('noConflict')) {
      this.load(this.onLoad);
    } else {
      this.onLoad();
    }
  }

  getSemanticEvents() {
    return SEMANTIC_EVENTS;
  }

  allowCustomEvents() {
    return true;
  }

  getEnrichableEventProps(event) {
    let enrichableProps = [];
    switch (event.name) {
    case VIEWED_PAGE:
      enrichableProps = [
        'page.type',
      ];
      break;
    case VIEWED_PRODUCT_DETAIL:
      enrichableProps = [
        'product',
      ];
      break;
    case VIEWED_CART:
      enrichableProps = [
        'cart',
      ];
      break;
    case COMPLETED_TRANSACTION:
      enrichableProps = [
        'transaction',
      ];
      break;
    default:
      // do nothing
    }

    const listVar = this.getOption('listVar');
    if (listVar.type === 'digitalData') {
      enrichableProps.push(listVar.value);
    }
    return enrichableProps;
  }

  isLoaded() {
    return !!(window._tmr && window._tmr.unload);
  }

  reset() {
    deleteProperty(window, '_tmr');
  }

  getList(event) {
    const listVar = this.getOption('listVar');
    let list;
    if (listVar) {
      list = getVarValue(listVar, event);
    }
    return list;
  }

  trackEvent(event) {
    const methods = {
      [VIEWED_PAGE]: 'onViewedPage',
      [VIEWED_PRODUCT_LISTING]: 'onViewedProductCategory',
      [VIEWED_PRODUCT_DETAIL]: 'onViewedProductDetail',
      [VIEWED_CART]: 'onViewedCart',
      [COMPLETED_TRANSACTION]: 'onCompletedTransaction',
    };

    const method = methods[event.name];
    if (this.getOption('counterId')) {
      if (method && !this.getOption('noConflict')) {
        this[method](event);
      } else if (!method) {
        this.trackCustomEvent(event);
      }
    }
  }

  onViewedPage(event) {
    window._tmr.push({
      id: this.getOption('counterId'),
      type: 'pageView',
      start: Date.now(),
    });

    const page = event.page;
    if (page) {
      if (page.type === 'home') {
        this.onViewedHome(event);
      } else if (['product', 'listing', 'category', 'checkout', 'confirmation', 'cart'].indexOf(page.type) < 0) {
        this.onViewedOtherPage(event);
      }
    }
  }

  onViewedHome(event) {
    window._tmr.push({
      type: 'itemView',
      productid: '',
      pagetype: 'home',
      totalvalue: '',
      list: this.getList(event),
    });
  }

  onViewedProductCategory(event) {
    window._tmr.push({
      type: 'itemView',
      productid: '',
      pagetype: 'category',
      totalvalue: '',
      list: this.getList(event),
    });
  }

  onViewedProductDetail(event) {
    const product = event.product;
    window._tmr.push({
      type: 'itemView',
      productid: product.id || '',
      pagetype: 'product',
      totalvalue: product.unitSalePrice || product.unitPrice || '',
      list: this.getList(event),
    });
  }

  onViewedCart(event) {
    const cart = event.cart;
    let productIds;

    if (cart.lineItems || cart.lineItems.length > 0) {
      productIds = lineItemsToProductIds(cart.lineItems);
    }

    window._tmr.push({
      type: 'itemView',
      productid: productIds || '',
      pagetype: 'cart',
      totalvalue: cart.total || cart.subtotal || '',
      list: this.getList(event),
    });
  }

  onViewedOtherPage(event) {
    window._tmr.push({
      type: 'itemView',
      productid: '',
      pagetype: 'other',
      totalvalue: '',
      list: this.getList(event),
    });
  }

  onCompletedTransaction(event) {
    const transaction = event.transaction;
    let productIds;

    if (transaction.lineItems || transaction.lineItems.length > 0) {
      productIds = lineItemsToProductIds(transaction.lineItems);
    }
    window._tmr.push({
      type: 'itemView',
      productid: productIds || '',
      pagetype: 'purchase',
      totalvalue: transaction.total || transaction.subtotal || '',
      list: this.getList(event),
    });
  }

  trackCustomEvent(event) {
    window._tmr.push({
      id: this.getOption('counterId'),
      type: 'reachGoal',
      goal: event.name,
    });
  }
}

export default MyTarget;
