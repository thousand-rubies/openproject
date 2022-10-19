import {
  ChangeDetectorRef, Directive, ElementRef, EventEmitter, OnDestroy, OnInit,
} from '@angular/core';
import { OpModalLocalsMap } from 'core-app/shared/components/modal/modal.types';
import { OpModalService } from 'core-app/shared/components/modal/modal.service';
import { UntilDestroyedMixin } from 'core-app/shared/helpers/angular/until-destroyed.mixin';

@Directive()
export abstract class OpModalComponent extends UntilDestroyedMixin implements OnInit, OnDestroy {
  /* Close on escape? */
  public closeOnEscape = true;

  public closeOnEscapeFunction = this.closeMe;

  /* Close on outside click */
  public closeOnOutsideClick = true;

  /* Reference to service */
  protected service:OpModalService = this.locals.service;

  public $element:HTMLElement;

  /** Closing event called from the service when closing this modal */
  public closingEvent = new EventEmitter<this>();

  public openingEvent = new EventEmitter<this>();

  /* Data to be return from this modal instance */
  public data:unknown;

  protected constructor(
    public locals:OpModalLocalsMap,
    readonly cdRef:ChangeDetectorRef,
    readonly elementRef:ElementRef,
  ) {
    super();
  }

  ngOnInit() {
    this.$element = this.elementRef.nativeElement;
  }

  ngOnDestroy() {
    this.closingEvent.complete();
    this.openingEvent.complete();
  }

  /**
   * Called when the user attempts to close the modal window.
   * The service will close this modal if this method returns true
   * @returns {boolean}
   */
  public onClose():boolean {
    this.afterFocusOn && this.afterFocusOn.focus();
    return true;
  }

  public closeMe(evt?:Event):void {
    this.service.close();

    if (evt) {
      evt.stopPropagation();
      evt.preventDefault();
    }
  }

  public onOpen():void {
    this.openingEvent.emit();
    this.cdRef.detectChanges();
  }

  protected get afterFocusOn():HTMLElement {
    return this.$element;
  }
}
