import { handler as regexMatch } from './default/regexMatch';
import { handler as sentenceCount } from './default/sentenceCount';
import { handler as wordCount } from './default/wordCount';
import { handler as characterCount } from './default/characterCount';
import { handler as jsonSchema } from './default/jsonSchema';
import { handler as jsonKeys } from './default/jsonKeys';
import { handler as contains } from './default/contains';
import { handler as validUrls } from './default/validUrls';
import { handler as webhook } from './default/webhook';
import { handler as containsCode } from './default/containsCode';
import { handler as moderateContent } from './portkey/moderateContent';
import { handler as language } from './portkey/language';
import { handler as pii } from './portkey/pii';
import { handler as gibberish } from './portkey/gibberish';
import { handler as validateProject } from './aporia/validateProject';
import { handler as sydeguard } from './sydelabs/sydeguard';
import { handler as scanPrompt } from './pillar/scanPrompt';
import { handler as scanResponse } from './pillar/scanResponse';
import { handler as phi } from './patronus/phi';
import { handler as patronusPii } from './patronus/pii';
import { handler as isConcise } from './patronus/isConcise';
import { handler as isHelpful } from './patronus/isHelpful';
import { handler as isPolite } from './patronus/isPolite';
import { handler as noApologies } from './patronus/noApologies';
import { handler as noGenderBias } from './patronus/noGenderBias';
import { handler as noRacialBias } from './patronus/noRacialBias';
import { handler as retrievalAnswerRelevance } from './patronus/retrievalAnswerRelevance';
import { handler as toxicity } from './patronus/toxicity';
import { handler as custom } from './patronus/custom';

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
    webhook: webhook,
    containsCode: containsCode,
  },
  portkey: {
    moderateContent: moderateContent,
    language: language,
    pii: pii,
    gibberish: gibberish,
  },
  aporia: {
    validateProject: validateProject,
  },
  sydelabs: {
    sydeguard: sydeguard,
  },
  pillar: {
    scanPrompt: scanPrompt,
    scanResponse: scanResponse,
  },
  patronus: {
    phi: phi,
    pii: patronusPii,
    isConcise: isConcise,
    isHelpful: isHelpful,
    isPolite: isPolite,
    noApologies: noApologies,
    noGenderBias: noGenderBias,
    noRacialBias: noRacialBias,
    retrievalAnswerRelevance: retrievalAnswerRelevance,
    toxicity: toxicity,
    custom: custom,
  },
};
