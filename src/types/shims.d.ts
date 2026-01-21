// Type shims for modules without proper type definitions
declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number;
    algorithm?: string;
  }

  export interface VerifyOptions {
    algorithms?: string[];
  }

  export function sign(
    payload: object,
    secretOrPrivateKey: string,
    options?: SignOptions
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string,
    options?: VerifyOptions
  ): any;
}

declare module 'bcrypt' {
  export function hash(data: string, saltRounds: number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
}

declare module 'multer' {
  export interface Multer {
    single(fieldname: string): any;
    array(fieldname: string, maxCount?: number): any;
  }

  export function diskStorage(options: any): any;
  
  function multer(options?: any): Multer;
  namespace multer {
    function diskStorage(options: any): any;
  }

  export default multer;
}
