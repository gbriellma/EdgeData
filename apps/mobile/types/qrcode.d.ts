declare module 'qrcode' {
  interface QRCodeToStringOptions {
    type?: 'svg' | 'utf8' | 'terminal';
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }

  function toString(
    text: string,
    options?: QRCodeToStringOptions
  ): Promise<string>;

  export default { toString };
}
