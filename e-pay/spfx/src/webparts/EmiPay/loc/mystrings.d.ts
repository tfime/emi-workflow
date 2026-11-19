declare interface IEmiPayWebPartStrings {
  PropertyPaneDescription: string;
  BasicGroupName: string;
  TitleFieldLabel: string;
  DemoModeFieldLabel: string;
  OrchestratorUrlFieldLabel: string;
  OrchestratorUrlFieldDescription: string;
}

declare module 'EmiPayWebPartStrings' {
  const strings: IEmiPayWebPartStrings;
  export = strings;
}
