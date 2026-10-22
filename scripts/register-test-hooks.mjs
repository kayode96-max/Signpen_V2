import { register } from 'node:module';

// Node's type stripper does not resolve extensionless TypeScript imports.
register('./ts-specifier-resolver.mjs', import.meta.url);
