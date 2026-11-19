import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import * as strings from 'EmiHubPortalWebPartStrings';
import EmiHubPortal from './components/EmiHubPortal';
import { IEmiHubPortalProps } from './components/EmiHubPortal';

export interface IEmiHubPortalWebPartProps {
  title: string;
  hubSiteUrl: string;
  emiSiteUrl: string;
  projectSiteUrl: string;
}

export default class EmiHubPortalWebPart extends BaseClientSideWebPart<IEmiHubPortalWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IEmiHubPortalProps> = React.createElement(
      EmiHubPortal,
      {
        title: this.properties.title || 'EMI Hub',
        hubSiteUrl:
          this.properties.hubSiteUrl ||
          'https://emicomvn.sharepoint.com/sites/eecm-demo',
        emiSiteUrl:
          this.properties.emiSiteUrl ||
          'https://emicomvn.sharepoint.com/sites/cecm',
        projectSiteUrl:
          this.properties.projectSiteUrl ||
          'https://emicomvn.sharepoint.com/sites/DnDemo',
        userDisplayName: this.context.pageContext.user.displayName || ''
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: 'Cấu hình',
              groupFields: [
                PropertyPaneTextField('title', {
                  label: strings.TitleFieldLabel
                }),
                PropertyPaneTextField('hubSiteUrl', {
                  label: strings.HubUrlFieldLabel
                }),
                PropertyPaneTextField('emiSiteUrl', {
                  label: strings.EmiUrlFieldLabel
                }),
                PropertyPaneTextField('projectSiteUrl', {
                  label: strings.ProjectUrlFieldLabel
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
