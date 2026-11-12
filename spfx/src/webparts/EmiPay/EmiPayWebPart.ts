import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import * as strings from 'EmiPayWebPartStrings';
import EmiPay from './components/EmiPay';
import { IEmiPayProps } from './components/EmiPay';

export interface IEmiPayWebPartProps {
  title: string;
  demoMode: boolean;
}

export default class EmiPayWebPart extends BaseClientSideWebPart<IEmiPayWebPartProps> {
  public render(): void {
    const element: React.ReactElement<IEmiPayProps> = React.createElement(EmiPay, {
      title: this.properties.title || 'EMI PAY',
      demoMode: this.properties.demoMode === true,
      userDisplayName: this.context.pageContext.user.displayName || '',
      userLoginName: this.context.pageContext.user.loginName || '',
      webUrl: this.context.pageContext.web.absoluteUrl,
      spHttpClient: this.context.spHttpClient
    });

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
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('title', { label: strings.TitleFieldLabel }),
                PropertyPaneToggle('demoMode', {
                  label: strings.DemoModeFieldLabel,
                  onText: 'Demo (mock)',
                  offText: 'Live CECM'
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
