// -- copyright
// OpenProject is an open source project management software.
// Copyright (C) 2012-2022 the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Injector,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { InjectField } from 'core-app/shared/helpers/angular/inject-field.decorator';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { OpModalComponent } from 'core-app/shared/components/modal/modal.component';
import { OpModalLocalsMap } from 'core-app/shared/components/modal/modal.types';
import { OpModalLocalsToken } from 'core-app/shared/components/modal/modal.service';
import { DatePicker } from 'core-app/shared/components/op-date-picker/datepicker';
import { HalResourceEditingService } from 'core-app/shared/components/fields/edit/services/hal-resource-editing.service';
import { ResourceChangeset } from 'core-app/shared/components/fields/changeset/resource-changeset';
import { ConfigurationService } from 'core-app/core/config/configuration.service';
import { TimezoneService } from 'core-app/core/datetime/timezone.service';
import { DayElement } from 'flatpickr/dist/types/instance';
import flatpickr from 'flatpickr';
import {
  debounceTime,
  filter,
  map,
  switchMap,
} from 'rxjs/operators';
import { activeFieldContainerClassName } from 'core-app/shared/components/fields/edit/edit-form/edit-form';
import {
  fromEvent,
  merge,
  Observable,
  Subject,
} from 'rxjs';
import { ApiV3Service } from 'core-app/core/apiv3/api-v3.service';
import { FormResource } from 'core-app/features/hal/resources/form-resource';
import { DateModalRelationsService } from 'core-app/shared/components/datepicker/services/date-modal-relations.service';
import { DateModalSchedulingService } from 'core-app/shared/components/datepicker/services/date-modal-scheduling.service';
import {
  areDatesEqual,
  mappedDate,
  onDayCreate,
  parseDate,
  setDates,
  validDate,
} from 'core-app/shared/components/datepicker/helpers/date-modal.helpers';
import { WeekdayService } from 'core-app/core/days/weekday.service';
import { FocusHelperService } from 'core-app/shared/directives/focus/focus-helper';
import { DeviceService } from 'core-app/core/browser/device.service';
import DateOption = flatpickr.Options.DateOption;
import { DayResourceService } from 'core-app/core/state/days/day.service';

export type DateKeys = 'start'|'end';
export type DateFields = DateKeys|'duration';

type StartUpdate = { startDate:string };
type EndUpdate = { dueDate:string };
type DurationUpdate = { duration:string|number|null };
type DateUpdate = { date:string };
type ActiveDateChange = [DateFields, null|Date|Date];

export type FieldUpdates =
  StartUpdate
  |EndUpdate
  |(StartUpdate&EndUpdate)
  |(StartUpdate&DurationUpdate)
  |(EndUpdate&DurationUpdate)
  |DateUpdate;

@Component({
  templateUrl: './multi-date.modal.html',
  styleUrls: ['../styles/datepicker.modal.sass', '../styles/datepicker_mobile.modal.sass'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    DateModalSchedulingService,
    DateModalRelationsService,
  ],
})
export class MultiDateModalComponent extends OpModalComponent implements AfterViewInit {
  @InjectField() I18n!:I18nService;

  @InjectField() timezoneService:TimezoneService;

  @InjectField() halEditing:HalResourceEditingService;

  @InjectField() dateModalScheduling:DateModalSchedulingService;

  @InjectField() dateModalRelations:DateModalRelationsService;

  @InjectField() deviceService:DeviceService;

  @InjectField() weekdayService:WeekdayService;

  @InjectField() dayService:DayResourceService;

  @InjectField() focusHelper:FocusHelperService;

  @ViewChild('modalContainer') modalContainer:ElementRef<HTMLElement>;

  @ViewChild('durationField', { read: ElementRef }) durationField:ElementRef<HTMLElement>;

  text = {
    save: this.I18n.t('js.button_save'),
    cancel: this.I18n.t('js.button_cancel'),
    startDate: this.I18n.t('js.work_packages.properties.startDate'),
    endDate: this.I18n.t('js.work_packages.properties.dueDate'),
    duration: this.I18n.t('js.work_packages.properties.duration'),
    placeholder: this.I18n.t('js.placeholders.default'),
    today: this.I18n.t('js.label_today'),
    days: (count:number):string => this.I18n.t('js.units.day', { count }),
  };

  onDataUpdated = new EventEmitter<string>();

  scheduleManually = false;

  ignoreNonWorkingDays = false;

  duration:number|null;

  currentlyActivatedDateField:DateFields;

  htmlId = '';

  datePattern = '[0-9]{4}-[0-9]{2}-[0-9]{2}';

  dates:{ [key in DateKeys]:string|null } = {
    start: null,
    end: null,
  };

  // Manual changes from the inputs to start and end dates
  startDateChanged$ = new Subject<string>();

  startDateDebounced$:Observable<ActiveDateChange> = this.debouncedInput(this.startDateChanged$, 'start');

  endDateChanged$ = new Subject<string>();

  endDateDebounced$:Observable<ActiveDateChange> = this.debouncedInput(this.endDateChanged$, 'end');

  // Manual changes to the datepicker, with information which field was active
  datepickerChanged$ = new Subject<ActiveDateChange>();

  // Date updates from the datepicker or a manual change
  dateUpdates$ = merge(
    this.startDateDebounced$,
    this.endDateDebounced$,
    this.datepickerChanged$,
  )
    .pipe(
      this.untilDestroyed(),
      filter(() => !!this.datePickerInstance),
    )
    .subscribe(([field, update]) => {
      // When clearing the one date, clear the others as well
      if (update !== null) {
        this.handleSingleDateUpdate(field, update);
      }

      // Clear active field and duration
      // when the active field was cleared
      if (update === null && field !== 'duration') {
        this.clearWithDuration(field);
      }

      this.onDataChange();
      this.cdRef.detectChanges();
    });

  // Duration changes
  durationChanges$ = new Subject<string>();

  durationDebounced$ = this
    .durationChanges$
    .pipe(
      this.untilDestroyed(),
      debounceTime(500),
      map((value) => (value === '' ? null : Math.abs(parseInt(value, 10)))),
      filter((val) => val === null || !Number.isNaN(val)),
      filter((val) => val !== this.duration),
    )
    .subscribe((value) => this.applyDurationChange(value));

  // Duration is a special field as it changes its value based on its focus state
  // which is different from the highlight state...
  durationFocused = false;

  private changeset:ResourceChangeset;

  ignoreNonWorkingDaysWritable = true;

  private datePickerInstance:DatePicker;

  private formUpdates$ = new Subject<FieldUpdates>();

  private dateUpdateRequests$ = this
    .formUpdates$
    .pipe(
      this.untilDestroyed(),
      switchMap((fieldsToUpdate:FieldUpdates) => this
        .apiV3Service
        .work_packages
        .withOptionalId(this.changeset.id === 'new' ? null : this.changeset.id)
        .form
        .forPayload({
          ...fieldsToUpdate,
          lockVersion: this.changeset.value<string>('lockVersion'),
          ignoreNonWorkingDays: this.ignoreNonWorkingDays,
          scheduleManually: this.scheduleManually,
        })),
    )
    .subscribe((form) => this.updateDatesFromForm(form));

  constructor(
    readonly injector:Injector,
    @Inject(OpModalLocalsToken) public locals:OpModalLocalsMap,
    readonly cdRef:ChangeDetectorRef,
    readonly elementRef:ElementRef,
    readonly configurationService:ConfigurationService,
    readonly apiV3Service:ApiV3Service,
  ) {
    super(locals, cdRef, elementRef);
    this.changeset = locals.changeset as ResourceChangeset;
    this.htmlId = `wp-datepicker-${locals.fieldName as string}`;

    this.scheduleManually = !!this.changeset.value('scheduleManually');
    this.ignoreNonWorkingDays = !!this.changeset.value('ignoreNonWorkingDays');

    // Ensure we get the writable values from the loaded form
    void this
      .changeset
      .getForm()
      .then((form) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.ignoreNonWorkingDaysWritable = !!form.schema.ignoreNonWorkingDays.writable;
        this.cdRef.detectChanges();
      });

    this.setDurationDaysFromUpstream(this.changeset.value('duration'));

    this.dates.start = this.changeset.value('startDate');
    this.dates.end = this.changeset.value('dueDate');
    this.setCurrentActivatedField(this.initialActivatedField);
  }

  ngAfterViewInit():void {
    this
      .dateModalRelations
      .getMinimalDateFromPreceeding()
      .subscribe((date) => {
        this.initializeDatepicker(date);
        this.onDataChange();
      });

    // Autofocus duration if that's what activated us
    if (this.initialActivatedField === 'duration') {
      this.focusHelper.focus(this.durationField.nativeElement);
    }
  }

  changeSchedulingMode():void {
    this.initializeDatepicker();

    // If removing manual scheduling on parent, reset ignoreNWD to original value
    if (this.scheduleManually === false && !this.ignoreNonWorkingDaysWritable) {
      this.ignoreNonWorkingDays = !!this.changeset.value('ignoreNonWorkingDays');
    }

    this.cdRef.detectChanges();
  }

  changeNonWorkingDays():void {
    this.initializeDatepicker();

    // Resent the current start and duration so that the end date is calculated
    if (!!this.dates.start && !!this.duration) {
      this.formUpdates$.next({ startDate: this.dates.start, duration: this.durationAsIso8601 });
    }

    // If only one of the dates is set, sent that
    // Resent the current start and duration so that the end date is calculated
    if (!!this.dates.start && !this.dates.end) {
      this.formUpdates$.next({ startDate: this.dates.start });
    }

    if (!!this.dates.end && !this.dates.start) {
      this.formUpdates$.next({ dueDate: this.dates.end });
    }

    this.cdRef.detectChanges();
  }

  save($event:Event):void {
    $event.preventDefault();
    // Apply the changed scheduling mode if any
    this.changeset.setValue('scheduleManually', this.scheduleManually);

    // Apply include NWD
    this.changeset.setValue('ignoreNonWorkingDays', this.ignoreNonWorkingDays);

    // Apply the dates if they could be changed
    if (this.isSchedulable) {
      this.changeset.setValue('startDate', mappedDate(this.dates.start));
      this.changeset.setValue('dueDate', mappedDate(this.dates.end));
      this.changeset.setValue('duration', this.durationAsIso8601);
    }

    this.closeMe();
  }

  cancel():void {
    this.closeMe();
  }

  updateDate(key:DateKeys, val:string|null):void {
    if ((val === null || validDate(val)) && this.datePickerInstance) {
      this.dates[key] = mappedDate(val);
      const dateValue = parseDate(val || '') || undefined;
      this.enforceManualChangesToDatepicker(dateValue);
      this.cdRef.detectChanges();
    }
  }

  setCurrentActivatedField(val:DateFields):void {
    this.currentlyActivatedDateField = val;
  }

  toggleCurrentActivatedField():void {
    this.currentlyActivatedDateField = this.currentlyActivatedDateField === 'start' ? 'end' : 'start';
  }

  isStateOfCurrentActivatedField(val:DateFields):boolean {
    return this.currentlyActivatedDateField === val;
  }

  setToday(key:DateKeys):void {
    this.datepickerChanged$.next([key, new Date()]);

    const nextActive = key === 'start' ? 'end' : 'start';
    this.setCurrentActivatedField(nextActive);
  }

  // eslint-disable-next-line class-methods-use-this
  reposition(element:JQuery<HTMLElement>, target:JQuery<HTMLElement>):void {
    if (this.deviceService.isMobile) {
      return;
    }

    element.position({
      my: 'left top',
      at: 'left bottom',
      of: target,
      collision: 'flipfit',
    });
  }

  showTodayLink():boolean {
    return this.isSchedulable;
  }

  /**
   * Returns whether the user can alter the dates of the work package.
   */
  get isSchedulable():boolean {
    return this.scheduleManually || !this.dateModalRelations.isParent;
  }

  showFieldAsActive(field:DateFields):boolean {
    return this.isStateOfCurrentActivatedField(field) && this.isSchedulable;
  }

  handleDurationFocusIn():void {
    this.durationFocused = true;
    this.setCurrentActivatedField('duration');
  }

  handleDurationFocusOut():void {
    setTimeout(() => {
      this.durationFocused = false;
    });
  }

  get displayedDuration():string {
    if (!this.duration) {
      return '';
    }

    return this.text.days(this.duration);
  }

  private applyDurationChange(newValue:number|null):void {
    this.duration = newValue;
    this.cdRef.detectChanges();

    // If we cleared duration or left it empty
    // reset the value and the due date
    if (newValue === null) {
      this.updateDate('end', null);
      return;
    }

    if (this.dates.start) {
      this.formUpdates$.next({
        startDate: this.dates.start,
        duration: this.durationAsIso8601,
      });
    } else if (this.dates.end) {
      this.formUpdates$.next({
        dueDate: this.dates.end,
        duration: this.durationAsIso8601,
      });
    }
  }

  private get durationAsIso8601():string|null {
    if (this.duration) {
      return this.timezoneService.toISODuration(this.duration, 'days');
    }

    return null;
  }

  private clearWithDuration(field:DateKeys) {
    this.duration = null;
    this.dates[field] = null;
    this.enforceManualChangesToDatepicker();
  }

  private initializeDatepicker(minimalDate?:Date|null) {
    this.datePickerInstance?.destroy();
    this.datePickerInstance = new DatePicker(
      this.injector,
      '#flatpickr-input',
      [this.dates.start || '', this.dates.end || ''],
      {
        mode: 'range',
        showMonths: this.deviceService.isMobile ? 1 : 2,
        inline: true,
        onReady: (_date, _datestr, instance) => {
          instance.calendarContainer.classList.add('op-datepicker-modal--flatpickr-instance');
          this.reposition(jQuery(this.modalContainer.nativeElement), jQuery(`.${activeFieldContainerClassName}`));
          this.ensureHoveredSelection(instance.calendarContainer);
        },
        onChange: (dates:Date[], _datestr, instance) => {
          const activeField = this.currentlyActivatedDateField;

          // When two values are passed from datepicker and we don't have duration set,
          // just take the range provided by them
          if (dates.length === 2 && !this.duration) {
            this.setDatesAndDeriveDuration(dates[0], dates[1]);
            this.toggleCurrentActivatedField();
            return;
          }

          // Update with the same flow as entering a value
          const { latestSelectedDateObj } = instance as { latestSelectedDateObj:Date };
          this.datepickerChanged$.next([activeField, latestSelectedDateObj]);

          // The duration field is special in how it handles focus transitions
          // For start/due we just toggle here
          if (activeField !== 'duration') {
            this.toggleCurrentActivatedField();
          }
        },
        onDayCreate: (dObj:Date[], dStr:string, fp:flatpickr.Instance, dayElem:DayElement) => {
          void onDayCreate(
            dayElem,
            this.ignoreNonWorkingDays,
            this.dayService.isNonWorkingDay$(dayElem.dateObj),
            minimalDate,
            this.isDayDisabled(dayElem, minimalDate),
          );
        },
      },
      null,
    );
  }

  private enforceManualChangesToDatepicker(enforceDate?:Date) {
    let startDate = parseDate(this.dates.start || '');
    let endDate = parseDate(this.dates.end || '');

    if (startDate && endDate) {
      // If the start date is manually changed to be after the end date,
      // we adjust the end date to be at least the same as the newly entered start date.
      // Same applies if the end date is set manually before the current start date
      if (startDate > endDate && this.isStateOfCurrentActivatedField('start')) {
        endDate = startDate;
        this.dates.end = this.timezoneService.formattedISODate(endDate);
      } else if (endDate < startDate && this.isStateOfCurrentActivatedField('end')) {
        startDate = endDate;
        this.dates.start = this.timezoneService.formattedISODate(startDate);
      }
    }

    const dates = [startDate, endDate];
    setDates(dates, this.datePickerInstance, enforceDate);
    this.onDataChange();
  }

  private setDatesAndDeriveDuration(newStart:Date, newEnd:Date) {
    this.dates.start = this.timezoneService.formattedISODate(newStart);
    this.dates.end = this.timezoneService.formattedISODate(newEnd);

    // Derive duration
    this.formUpdates$.next({ startDate: this.dates.start, dueDate: this.dates.end });
  }

  private handleSingleDateUpdate(activeField:DateFields, selectedDate:Date) {
    if (activeField === 'duration') {
      this.durationActiveDateSelected(selectedDate);
      return;
    }

    // If both dates are now set, ensure we update it accordingly
    if (this.dates.start && this.dates.end) {
      this.replaceDatesWithNewSelection(activeField, selectedDate);
      return;
    }

    // Set the current date field
    this.moveActiveDate(activeField, selectedDate);

    // We may or may not have both fields set now
    // If we have duration set, we derive the other field
    if (this.duration) {
      this.deriveMissingDateFromDuration(activeField);
    } else if (this.dates.start && this.dates.end) {
      this.formUpdates$.next({ startDate: this.dates.start, dueDate: this.dates.end });
    }

    // Set the selected date on the datepicker
    this.enforceManualChangesToDatepicker(selectedDate);
  }

  /**
   * The duration field is active and a date was clicked in the datepicker.
   *
   * If the duration field has a value:
   *  - start date is updated, derive end date, set end date active
   * If the duration field has no value:
   *   - If start date has a value, finish date is set
   *   - Otherwise, start date is set
   *   - Focus is set to the finish date
   *
   * @param selectedDate The date selected
   * @private
   */
  private durationActiveDateSelected(selectedDate:Date) {
    const selectedIsoDate = this.timezoneService.formattedISODate(selectedDate);

    if (!this.duration && this.dates.start) {
      // When duration is empty and start is set, update finish
      this.setDaysInOrder(this.dates.start, selectedIsoDate);

      // Focus moves to start date
      this.setCurrentActivatedField('start');
    } else {
      // Otherwise, the start date always gets updated
      this.setDaysInOrder(selectedIsoDate, this.dates.end);

      // Focus moves to finish date
      this.setCurrentActivatedField('end');
    }

    if (this.dates.start && this.duration) {
      // If duration has value, derive end date from start and duration
      this.formUpdates$.next({ startDate: this.dates.start, duration: this.durationAsIso8601 });
    } else if (this.dates.start && this.dates.end) {
      // If start and due now have values, derive duration again
      this.formUpdates$.next({ startDate: this.dates.start, dueDate: this.dates.end });
    }
  }

  private setDaysInOrder(start:string|null, end:string|null) {
    const parsedStartDate = start ? parseDate(start) as Date : null;
    const parsedEndDate = end ? parseDate(end) as Date : null;

    if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
      this.dates.start = end;
      this.dates.end = start;
    } else {
      this.dates.start = start;
      this.dates.end = end;
    }
  }

  /**
   * The active field was updated in the datepicker, while the other date was not set
   *
   * This means we want to derive the non-active field using the duration, if that is set.
   *
   * @param activeField The active field that was changed
   * @private
   */
  private deriveMissingDateFromDuration(activeField:'start'|'end') {
    if (activeField === 'start' && !!this.dates.start) {
      this.formUpdates$.next({ startDate: this.dates.start, duration: this.durationAsIso8601 });
    }

    if (activeField === 'end' && !!this.dates.end) {
      this.formUpdates$.next({ dueDate: this.dates.end, duration: this.durationAsIso8601 });
    }
  }

  /**
   * Moves the active date to the given selected date.
   *
   * This is different from replaceDatesWithNewSelection as duration is prioritized higher in our case.
   * @param activeField
   * @param selectedDate
   * @private
   */
  private moveActiveDate(activeField:DateKeys, selectedDate:Date) {
    const parsedStartDate = this.dates.start ? parseDate(this.dates.start) as Date : null;
    const parsedEndDate = this.dates.end ? parseDate(this.dates.end) as Date : null;

    // Set the given field
    this.dates[activeField] = this.timezoneService.formattedISODate(selectedDate);

    // Special handling, moving finish date to before start date
    if (activeField === 'end' && parsedStartDate && parsedStartDate > selectedDate) {
      // Reset duration and start date
      this.duration = null;
      this.dates.start = null;
      // Update finish date and mark as active in datepicker
      this.enforceManualChangesToDatepicker(selectedDate);
    }

    // Special handling, moving start date to after finish date
    if (activeField === 'start' && parsedEndDate && parsedEndDate < selectedDate) {
      // Reset duration and start date
      this.duration = null;
      this.dates.end = null;
      // Update finish date and mark as active in datepicker
      this.enforceManualChangesToDatepicker(selectedDate);
    }
  }

  private replaceDatesWithNewSelection(activeField:DateFields, selectedDate:Date) {
    /**
     Overwrite flatpickr default behavior by not starting a new date range everytime but preserving either start or end date.
     There are three cases to cover.
     1. Everything before the current start date will become the new start date (independent of the active field)
     2. Everything after the current end date will become the new end date if that is the currently active field.
     If the active field is the start date, the selected date becomes the new start date and the end date is cleared.
     3. Everything in between the current start and end date is dependent on the currently activated field.
     * */

    const parsedStartDate = parseDate(this.dates.start || '') as Date;
    const parsedEndDate = parseDate(this.dates.end || '') as Date;

    if (selectedDate < parsedStartDate) {
      if (activeField === 'start') {
        // Set start, derive end from duration
        this.applyNewDates([selectedDate]);
      } else {
        // Reset duration and end date
        this.duration = null;
        this.applyNewDates(['', selectedDate]);
      }
    } else if (selectedDate > parsedEndDate) {
      if (activeField === 'end') {
        this.applyNewDates([parsedStartDate, selectedDate]);
      } else {
        // Reset duration and end date
        this.duration = null;
        this.applyNewDates([selectedDate]);
      }
    } else if (areDatesEqual(selectedDate, parsedStartDate) || areDatesEqual(selectedDate, parsedEndDate)) {
      this.applyNewDates([selectedDate, selectedDate]);
    } else {
      const newDates = activeField === 'start' ? [selectedDate, parsedEndDate] : [parsedStartDate, selectedDate];
      this.applyNewDates(newDates);
    }
  }

  private applyNewDates([start, end]:DateOption[]) {
    this.dates.start = start ? this.timezoneService.formattedISODate(start) : null;
    this.dates.end = end ? this.timezoneService.formattedISODate(end) : null;

    // Apply the dates to the datepicker
    setDates([start, end], this.datePickerInstance);

    // We updated either start, end, or both fields
    // If both are now set, we want to derive duration from them
    if (this.dates.start && this.dates.end) {
      this.formUpdates$.next({ startDate: this.dates.start, dueDate: this.dates.end });
    }

    // If only one is set, derive from duration
    if (this.dates.start && !this.dates.end && !!this.duration) {
      this.formUpdates$.next({ startDate: this.dates.start, duration: this.durationAsIso8601 });
    }

    if (this.dates.end && !this.dates.start && !!this.duration) {
      this.formUpdates$.next({ dueDate: this.dates.end, duration: this.durationAsIso8601 });
    }
  }

  private onDataChange() {
    const start = this.dates.start || '';
    const end = this.dates.end || '';

    const output = `${start} - ${end}`;
    this.onDataUpdated.emit(output);
  }

  private get initialActivatedField():DateFields {
    switch (this.locals.fieldName) {
      case 'startDate':
        return 'start';
      case 'dueDate':
        return 'end';
      case 'duration':
        return 'duration';
      default:
        return (this.dates.start && !this.dates.end) ? 'end' : 'start';
    }
  }

  private isDayDisabled(dayElement:DayElement, minimalDate?:Date|null):boolean {
    return !this.isSchedulable || (!this.scheduleManually && !!minimalDate && dayElement.dateObj <= minimalDate);
  }

  /**
   * Update the datepicker dates and properties from a form response
   * that includes derived/calculated values.
   *
   * @param form
   * @private
   */
  private updateDatesFromForm(form:FormResource):void {
    const payload = form.payload as { startDate:string, dueDate:string, duration:string, ignoreNonWorkingDays:boolean };
    this.dates.start = payload.startDate;
    this.dates.end = payload.dueDate;
    this.ignoreNonWorkingDays = payload.ignoreNonWorkingDays;

    this.setDurationDaysFromUpstream(payload.duration);

    const parsedStartDate = parseDate(this.dates.start) as Date;
    this.enforceManualChangesToDatepicker(parsedStartDate);
    this.cdRef.detectChanges();
  }

  /**
   * Updates the duration property and the displayed value
   * @param value a ISO8601 duration string or null
   * @private
   */
  private setDurationDaysFromUpstream(value:string|null) {
    const durationDays = value ? this.timezoneService.toDays(value) : null;

    if (!durationDays || durationDays === 0) {
      this.duration = null;
    } else {
      this.duration = durationDays;
    }
  }

  private debouncedInput(input$:Subject<string>, key:DateKeys):Observable<ActiveDateChange> {
    return input$
      .pipe(
        this.untilDestroyed(),
        // Skip values that are already set as the current model
        filter((value) => value !== this.dates[key]),
        // Avoid that the manual changes are moved to the datepicker too early.
        // The debounce is chosen quite large on purpose to catch the following case:
        //   1. Start date is for example 2022-07-15. The user wants to set the end date to the 19th.
        //   2. So he/she starts entering the finish date 2022-07-1 .
        //   3. This is already a valid date. Since it is before the start date,the start date would be changed automatically to the first without the debounce.
        //   4. The debounce gives the user enough time to type the last number "9" before the changes are converted to the datepicker and the start date would be affected.
        debounceTime(500),
        filter((date) => validDate(date)),
        map((date) => {
          if (date === '') {
            return null;
          }

          return parseDate(date) as Date;
        }),
        map((date) => [key, date]),
      );
  }

  /**
   * When hovering selections in the range datepicker, the range usually
   * stays active no matter where the cursor is.
   *
   * We want to hide any hovered selection preview when we leave the datepicker.
   * @param calendarContainer
   * @private
   */
  private ensureHoveredSelection(calendarContainer:HTMLDivElement) {
    fromEvent(calendarContainer, 'mouseenter')
      .pipe(
        this.untilDestroyed(),
      )
      .subscribe(() => calendarContainer.classList.remove('flatpickr-container-suppress-hover'));

    fromEvent(calendarContainer, 'mouseleave')
      .pipe(
        this.untilDestroyed(),
        filter(() => !(!!this.dates.start && !!this.dates.end)),
      )
      .subscribe(() => calendarContainer.classList.add('flatpickr-container-suppress-hover'));
  }
}
