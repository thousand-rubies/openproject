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

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CookieService } from 'ngx-cookie-service';

import { IconModule } from 'core-app/shared/components/icon/icon.module';
import { OpSpotModule } from 'core-app/spot/spot.module';

import { FileLinkListComponent } from 'core-app/shared/components/file-links/file-link-list/file-link-list.component';
import {
  FileLinkListItemComponent,
} from 'core-app/shared/components/file-links/file-link-list-item/file-link-list-item.component';
import {
  StorageInformationComponent,
} from 'core-app/shared/components/file-links/storage-information/storage-information.component';
import {
  FilePickerModalComponent,
} from 'core-app/shared/components/file-links/file-picker-modal/file-picker-modal.component';
import { OPSharedModule } from 'core-app/shared/shared.module';
import {
  StorageFileListItemComponent,
} from 'core-app/shared/components/file-links/storage-file-list-item/storage-file-list-item.component';
import { SortFilesPipe } from 'core-app/shared/components/file-links/file-picker-modal/sort-files.pipe';
import {
  LoadingFileListComponent,
} from 'core-app/shared/components/file-links/laoding-file-list/loading-file-list.component';

@NgModule({
  imports: [
    CommonModule,
    IconModule,
    OpSpotModule,
    OPSharedModule,
  ],
  declarations: [
    FileLinkListComponent,
    FileLinkListItemComponent,
    FilePickerModalComponent,
    LoadingFileListComponent,
    StorageInformationComponent,
    StorageFileListItemComponent,
    SortFilesPipe,
  ],
  exports: [
    FileLinkListComponent,
  ],
  providers: [
    CookieService,
  ],
})
export class OpenprojectFileLinksModule {}
