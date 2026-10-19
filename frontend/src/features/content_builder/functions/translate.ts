import { i18n } from "@/i18n";

//The global translate function, for the builder's store and functions (outside a
//component). Typed loosely on purpose: the full message type is too deep for the
//compiler when a key is built at run time. Reads the current locale on every call,
//so anything computed from it follows the interface language.
type Translate = (key:string, params?:Record<string, string | number>) => string;
const global = (i18n as unknown as { global:{ t:Translate } }).global;

export function translate(key:string, params:Record<string, string | number> = {}):string{
    return global.t(key, params);
}
