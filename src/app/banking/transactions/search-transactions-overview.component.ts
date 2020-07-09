import { ChangeDetectionStrategy, Component, Injector, OnInit } from '@angular/core';
import {
  Currency,
  PaymentRequestStatusEnum, RoleEnum, TransactionAuthorizationStatusEnum, TransactionDataForSearch,
  TransactionKind, TransactionOverviewDataForSearch, TransactionOverviewQueryFilters, TransactionOverviewResult
} from 'app/api/models';
import { TransactionsService } from 'app/api/services';
import { BankingHelperService } from 'app/core/banking-helper.service';
import { TransactionStatusService } from 'app/core/transaction-status.service';
import { ApiHelper } from 'app/shared/api-helper';
import { BaseSearchPageComponent } from 'app/shared/base-search-page.component';
import { FieldOption } from 'app/shared/field-option';
import { Menu } from 'app/shared/menu';

/**
 * Search for transactions overview
 */
@Component({
  selector: 'search-transactions-overview',
  templateUrl: 'search-transactions-overview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchTransactionsOverviewComponent
  extends BaseSearchPageComponent<TransactionOverviewDataForSearch, TransactionOverviewQueryFilters, TransactionOverviewResult>
  implements OnInit {

  kind: 'authorized' | 'myAuth' | 'payment-request';
  heading: string;
  mobileHeading: string;
  usePeriod = true;
  currenciesByKey = new Map<string, Currency>();
  currencies: Currency[];
  hasTransactionNumber: boolean;
  transactionNumberPattern: string;

  constructor(
    injector: Injector,
    private transactionsService: TransactionsService,
    public transactionStatusService: TransactionStatusService,
    public bankingHelper: BankingHelperService) {
    super(injector);
  }

  ngOnInit() {
    super.ngOnInit();
    const route = this.route.snapshot;
    this.kind = route.data.kind;

    switch (this.kind) {
      case 'authorized':
        this.heading = this.i18n.transaction.title.authorizations;
        this.mobileHeading = this.i18n.transaction.mobileTitle.authorizations;
        break;
      case 'myAuth':
        this.heading = this.i18n.transaction.title.pendingMyAuthorization;
        this.mobileHeading = this.i18n.transaction.mobileTitle.pendingMyAuthorization;
        this.usePeriod = false;
        break;
      case 'payment-request':
        this.heading = this.i18n.transaction.title.paymentRequestsOverview;
        this.mobileHeading = this.i18n.transaction.mobileTitle.paymentRequestsOverview;
        break;
    }

    // Get the transactions search data
    this.stateManager.cache('data',
      this.transactionsService.getTransactionsOverviewDataForSearch({
        fields: ['user', 'accountTypes', ...(this.usePeriod ? ['preselectedPeriods'] : []), 'query'],
      }),
    ).subscribe(data => {
      if (this.usePeriod) {
        this.bankingHelper.preProcessPreselectedPeriods(data, this.form);
      }
      this.data = data;
    });
  }

  onDataInitialized(data: TransactionOverviewDataForSearch) {
    super.onDataInitialized(data);
    this.currencies = [...new Set(data.accountTypes.map(at => at.currency))];
    this.currencies.sort((c1, c2) => c1.name.localeCompare(c2.name));
    this.currenciesByKey = new Map();
    this.currencies.forEach(c => this.currenciesByKey.set(c.id, c));
    const transactionNumberPatterns = this.currencies
      .map(c => c.transactionNumberPattern)
      .filter(p => p)
      .reduce((unique, item) => unique.includes(item) ? unique : [...unique, item], []);
    this.hasTransactionNumber = transactionNumberPatterns.length > 0;
    this.transactionNumberPattern = transactionNumberPatterns.length === 1 ? transactionNumberPatterns[0] : null;
    this.headingActions = this.exportHelper.headingActions(data.exportFormats,
      f => this.transactionsService.exportTransactionsOverview$Response({
        format: f.internalName,
        ...this.toSearchParams(this.form.value)
      }));
  }

  doSearch(value: TransactionOverviewQueryFilters) {
    return this.transactionsService.searchTransactionsOverview$Response(value);
  }

  getFormControlNames() {
    return ['status', 'currency', 'user', 'preselectedPeriod', 'periodBegin', 'periodEnd', 'transactionNumber', 'expirationBegin',
      'expirationEnd'];
  }

  getInitialFormValue(data: TransactionDataForSearch) {
    const value = super.getInitialFormValue(data);
    switch (this.kind) {
      case 'authorized':
        value.status = TransactionAuthorizationStatusEnum.PENDING;
        break;
      case 'payment-request':
        value.status = PaymentRequestStatusEnum.OPEN;
        break;
    }
    return value;
  }

  get statusOptions(): FieldOption[] {
    switch (this.kind) {
      case 'authorized':
        const statuses = Object.values(TransactionAuthorizationStatusEnum) as TransactionAuthorizationStatusEnum[];
        return statuses.map(st => ({
          value: st,
          text: this.transactionStatusService.authorizationStatus(st),
        }));
      case 'payment-request':
        return (Object.values(PaymentRequestStatusEnum) as PaymentRequestStatusEnum[]).map(st => ({
          value: st,
          text: this.transactionStatusService.paymentRequestStatus(st)
        }));
      case 'myAuth':
        // Isn't filtered by status
        return null;
    }
  }

  protected toSearchParams(value: any): TransactionOverviewQueryFilters {
    const params: TransactionOverviewQueryFilters = value;
    params.currencies = value.currency ? [value.currency] : [];
    if (this.usePeriod) {
      params.datePeriod = this.bankingHelper.resolveDatePeriod(value);
    }
    if (this.isPaymentRequest()) {
      params.paymentRequestExpiration = ApiHelper.dateRangeFilter(value.expirationBegin, value.expirationEnd);
    }
    switch (this.kind) {
      case 'authorized':
        params.authorizationStatuses = [value.status];
        params.authorized = true;
        break;
      case 'myAuth':
        params.pendingMyAuthorization = true;
        break;
      case 'payment-request':
        params.paymentRequestStatuses = [value.status];
        params.kinds = [TransactionKind.PAYMENT_REQUEST];
        break;
    }
    return params;
  }

  isPaymentRequest(): boolean {
    return this.kind === 'payment-request';
  }

  resolveMenu(data: TransactionDataForSearch) {
    let menu: Menu;
    switch (this.kind) {
      case 'authorized':
        if (this.dataForUiHolder.role === RoleEnum.BROKER) {
          menu = Menu.BROKER_AUTHORIZED_PAYMENTS_OVERVIEW;
        } else {
          menu = Menu.AUTHORIZED_PAYMENTS_OVERVIEW;
        }
        break;
      case 'myAuth':
        menu = Menu.PENDING_MY_AUTHORIZATION;
        break;
      case 'payment-request':
        menu = Menu.PAYMENT_REQUESTS_OVERVIEW;
        break;
    }
    return this.authHelper.userMenu(data.user, menu);
  }

  get toLink() {
    return (row: TransactionOverviewResult) => this.bankingHelper.transactionPath(row);
  }
}
