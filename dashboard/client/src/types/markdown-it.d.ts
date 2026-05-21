declare module 'markdown-it' {
  interface MarkdownItOptions {
    html?: boolean;
    linkify?: boolean;
    highlight?: (value: string, lang: string) => string;
  }

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    render(source: string): string;
  }
}
