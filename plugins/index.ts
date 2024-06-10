import { handler as regexMatch } from './default/regexMatch';
import { handler as sentenceCount } from './default/sentenceCount';
import { handler as wordCount } from './default/wordCount';
import { handler as characterCount } from './default/characterCount';
import { handler as jsonSchema } from './default/jsonSchema';
import { handler as jsonKeys } from './default/jsonKeys';
import { handler as contains } from './default/contains';
import { handler as validUrls } from './default/validUrls';
import { handler as containsCode } from './default/containsCode';
import { handler as moderateContent } from './portkey/moderateContent';
import { handler as language } from './portkey/language';
import { handler as pii } from './portkey/pii';
import { handler as gibberish } from './portkey/gibberish';

export const plugins = {
  default: {
    regexMatch: regexMatch,
    sentenceCount: sentenceCount,
    wordCount: wordCount,
    characterCount: characterCount,
    jsonSchema: jsonSchema,
    jsonKeys: jsonKeys,
    contains: contains,
    validUrls: validUrls,
    containsCode: containsCode,
  },
  portkey: {
    moderateContent: moderateContent,
    language: language,
    pii: pii,
    gibberish: gibberish,
  },
};
