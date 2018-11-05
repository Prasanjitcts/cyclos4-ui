import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Injector, Input, Output } from '@angular/core';
import { AdCategoryWithChildren, AdResult, Currency, Image } from 'app/api/models';
import { AdDataForSearch } from 'app/api/models/ad-data-for-search';
import { ShowSubCategoriesComponent } from 'app/marketplace/search/show-sub-categories.component';
import { BaseComponent } from 'app/shared/base.component';
import { PageData } from 'app/shared/page-data';
import { PagedResults } from 'app/shared/paged-results';
import { ResultType } from 'app/shared/result-type';
import { environment } from 'environments/environment';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BehaviorSubject } from 'rxjs';
import { truthyAttr } from 'app/shared/helper';

const MAX_CHILDREN = 5;

/**
 * Display the results of an advertisements search
 */
@Component({
  selector: 'ads-results',
  templateUrl: 'ads-results.component.html',
  styleUrls: ['ads-results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdsResultsComponent extends BaseComponent {

  @HostBinding('class') clazz = 'flex-grow-1 d-flex';

  @Input() resultType: ResultType;
  @Input() rendering$: BehaviorSubject<boolean>;
  private _singleUser: boolean | string = false;
  @Input() get singleUser(): boolean | string {
    return this._singleUser;
  }
  set singleUser(single: boolean | string) {
    this._singleUser = truthyAttr(single);
  }

  categoryTrail$ = new BehaviorSubject<AdCategoryWithChildren[]>(null);

  @Input() data: AdDataForSearch;

  @Input() results: PagedResults<AdResult>;

  @Output() update = new EventEmitter<PageData>();

  @Output() categorySelected = new EventEmitter<AdCategoryWithChildren>();

  constructor(
    injector: Injector,
    private modal: BsModalService
  ) {
    super(injector);
  }

  toAddress(ad: AdResult) {
    return ad.address;
  }

  toMarkerTitle(ad: AdResult) {
    return ad.name;
  }

  /**
   * Returns the display name of the given custom field
   * @param field The field identifier
   */
  fieldName(field: string): string {
    const customField = this.data.customFields.find(cf => cf.internalName === field);
    return (customField || {}).name;
  }

  /**
   * Returns the route components for the given ad
   */
  path(ad: AdResult): string[] {
    return ['/marketplace', 'view', ad.id];
  }

  /**
   * Returns the currency for the given ad
   * @param ad The advertisement
   */
  lookupCurrency(ad: AdResult): Currency {
    const currencies = this.data.currencies;
    return currencies.find(c => c.internalName === ad.currency || c.id === ad.currency);
  }

  /**
   * Returns the number of decimals for the given ad's price
   * @param ad The advertisement
   */
  decimals(ad: AdResult): number {
    return (this.lookupCurrency(ad) || {}).decimalDigits || 0;
  }

  /**
   * Select a category and show results for that one
   */
  selectCategory(category: AdCategoryWithChildren) {
    if (category.id == null) {
      // Root category
      this.resultType = ResultType.CATEGORIES;
      this.categoryTrail$.next([]);
      return;
    }

    // This will trigger an update
    this.resultType = this.layout.xxs ? ResultType.LIST : ResultType.TILES;
    this.results = null;

    const trail: AdCategoryWithChildren[] = [];
    trail.unshift(category);
    const parent = this.findParent(category);
    if (parent) {
      trail.unshift(parent);
    }
    const root: AdCategoryWithChildren = {
      name: this.i18n('Main')
    };
    trail.unshift(root);
    this.categoryTrail$.next(trail);

    this.categorySelected.emit(category);
  }

  private findParent(category: AdCategoryWithChildren): AdCategoryWithChildren {
    for (const cat of this.data.categories) {
      if (cat.children.includes(category)) {
        return cat;
      }
    }
    return null;
  }

  /**
   * Returns the configured display color for the given category
   * @param cat The category
   */
  categoryColor(cat: AdCategoryWithChildren): string {
    const colors = environment.adCategoryColors || {};
    return colors[cat.internalName];
  }

  /**
   * Returns the configured icon for the given category
   * @param cat The category
   */
  categoryIcon(cat: AdCategoryWithChildren): string {
    const icons = environment.adCategoryIcons || {};
    return icons[cat.internalName] || 'category';
  }

  /**
   * Returns the category image, but only if it doesn't have a specific icon
   * @param cat The category
   */
  categoryImage(cat: AdCategoryWithChildren): Image {
    if (this.categoryIcon(cat)) {
      return null;
    }
    return cat.image;
  }

  /**
   * Return a maximum of `MAX_CHILDREN` child categories
   * @param cat The category
   */
  categoryChildren(cat: AdCategoryWithChildren): AdCategoryWithChildren[] {
    const children = cat.children || [];
    return children.length <= MAX_CHILDREN ? children : children.slice(0, MAX_CHILDREN);
  }

  /**
   * Returns whether the given category has more children than the maximum allowed
   * @param cat The category
   */
  hasMoreChildren(cat: AdCategoryWithChildren): boolean {
    const children = cat.children || [];
    return children.length > MAX_CHILDREN;
  }

  /**
   * Opens a dialog for the user to pick a child category
   * @param cat The category
   */
  showAllChildren(cat: AdCategoryWithChildren): void {
    const ref = this.modal.show(ShowSubCategoriesComponent, {
      class: 'modal-form modal-small',
      initialState: {
        category: cat,
        image: this.categoryImage(cat),
        icon: this.categoryIcon(cat),
        color: this.categoryColor(cat)
      }
    });
    const comp = ref.content as ShowSubCategoriesComponent;
    this.addSub(comp.select.subscribe(sub => {
      this.selectCategory(sub);
    }));
  }

}