import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { AadHttpClient } from '@microsoft/sp-http';

import * as strings from 'EmiPayWebPartStrings';
import EmiPay from './components/EmiPay';
import { IEmiPayProps } from './components/EmiPay';
import { expandCanvasParents } from '../../shared/ui/expandCanvas';
import { IOrchestratorHttpResult } from './services/SpRest';

/** Audience bắt buộc cho HTTP trigger Flow (kèm trailing slash). */
const FLOW_SERVICE_AUDIENCE = 'https://service.flow.microsoft.com/';

export interface IEmiPayWebPartProps {
  title: string;
  demoMode: boolean;
  /** HTTP URL of Core Flow (When a HTTP request is received). */
  orchestratorUrl: string;
}

export default class EmiPayWebPart extends BaseClientSideWebPart<IEmiPayWebPartProps> {
  private async postToOrchestrator(
    url: string,
    body: unknown
  ): Promise<IOrchestratorHttpResult> {
    const client = await this.context.aadHttpClientFactory.getClient(
      FLOW_SERVICE_AUDIENCE
    );
    const res = await client.post(url, AadHttpClient.configurations.v1, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  }

  public render(): void {
    const element: React.ReactElement<IEmiPayProps> = React.createElement(EmiPay, {
      title: this.properties.title || 'EMI PAY',
      demoMode: this.properties.demoMode === true,
      orchestratorUrl: (this.properties.orchestratorUrl || '').trim(),
      userDisplayName: this.context.pageContext.user.displayName || '',
      userLoginName: this.context.pageContext.user.loginName || '',
      webUrl: this.context.pageContext.web.absoluteUrl,
      spHttpClient: this.context.spHttpClient,
      postToOrchestrator: (url, body) => this.postToOrchestrator(url, body)
    });

    ReactDom.render(element, this.domElement);
    // Match emi-uikit EmiEcm: expand now and again after SharePoint finishes layout.
    expandCanvasParents(this.domElement);
    window.setTimeout(() => expandCanvasParents(this.domElement), 100);
    window.setTimeout(() => expandCanvasParents(this.domElement), 400);
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
                }),
                PropertyPaneTextField('orchestratorUrl', {
                  label: strings.OrchestratorUrlFieldLabel,
                  description: strings.OrchestratorUrlFieldDescription,
                  multiline: true,
                  rows: 3
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
