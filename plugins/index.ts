import { handler as defaultregexMatch } from "./default/regexMatch"
import { handler as defaultallowedRequestTypes } from "./default/allowedRequestTypes"
import { handler as defaultsentenceCount } from "./default/sentenceCount"
import { handler as defaultwordCount } from "./default/wordCount"
import { handler as defaultcharacterCount } from "./default/characterCount"
import { handler as defaultjsonSchema } from "./default/jsonSchema"
import { handler as defaultjsonKeys } from "./default/jsonKeys"
import { handler as defaultcontains } from "./default/contains"
import { handler as defaultvalidUrls } from "./default/validUrls"
import { handler as defaultwebhook } from "./default/webhook"
import { handler as defaultlog } from "./default/log"
import { handler as defaultcontainsCode } from "./default/containsCode"
import { handler as defaultalluppercase } from "./default/alluppercase"
import { handler as defaultendsWith } from "./default/endsWith"
import { handler as defaultalllowercase } from "./default/alllowercase"
import { handler as defaultmodelwhitelist } from "./default/modelwhitelist"
import { handler as defaultmodelRules } from "./default/modelRules"
import { handler as defaultjwt } from "./default/jwt"
import { handler as defaultrequiredMetadataKeys } from "./default/requiredMetadataKeys"
import { handler as defaultaddPrefix } from "./default/addPrefix"
import { handler as defaultnotNull } from "./default/notNull"
import { handler as portkeymoderateContent } from "./portkey/moderateContent"
import { handler as portkeylanguage } from "./portkey/language"
import { handler as portkeypii } from "./portkey/pii"
import { handler as portkeygibberish } from "./portkey/gibberish"
import { handler as qualifirecontentModeration } from "./qualifire/contentModeration"
import { handler as qualifirehallucinations } from "./qualifire/hallucinations"
import { handler as qualifirepii } from "./qualifire/pii"
import { handler as qualifirepromptInjections } from "./qualifire/promptInjections"
import { handler as qualifiregrounding } from "./qualifire/grounding"
import { handler as qualifiretoolUseQuality } from "./qualifire/toolUseQuality"
import { handler as qualifirepolicy } from "./qualifire/policy"
import { handler as aporiavalidateProject } from "./aporia/validateProject"
import { handler as sydelabssydeguard } from "./sydelabs/sydeguard"
import { handler as pillarscanPrompt } from "./pillar/scanPrompt"
import { handler as pillarscanResponse } from "./pillar/scanResponse"
import { handler as patronusphi } from "./patronus/phi"
import { handler as patronuspii } from "./patronus/pii"
import { handler as patronusisConcise } from "./patronus/isConcise"
import { handler as patronusisHelpful } from "./patronus/isHelpful"
import { handler as patronusisPolite } from "./patronus/isPolite"
import { handler as patronusnoApologies } from "./patronus/noApologies"
import { handler as patronusnoGenderBias } from "./patronus/noGenderBias"
import { handler as patronusnoRacialBias } from "./patronus/noRacialBias"
import { handler as patronusretrievalAnswerRelevance } from "./patronus/retrievalAnswerRelevance"
import { handler as patronusretrievalHallucination } from "./patronus/retrievalHallucination"
import { handler as patronustoxicity } from "./patronus/toxicity"
import { handler as patronuscustom } from "./patronus/custom"
import { handler as pangeatextGuard } from "./pangea/textGuard"
import { handler as pangeapii } from "./pangea/pii"
import { handler as promptsecurityprotectPrompt } from "./promptsecurity/protectPrompt"
import { handler as promptsecurityprotectResponse } from "./promptsecurity/protectResponse"
import { handler as panwPrismaAirsintercept } from "./panw-prisma-airs/intercept"
import { handler as walledaiwalledprotect } from "./walledai/walledprotect"
import { handler as aktoScan } from "./akto/scan"

export const plugins = {
  "default": {
    "regexMatch": defaultregexMatch,
    "allowedRequestTypes": defaultallowedRequestTypes,
    "sentenceCount": defaultsentenceCount,
    "wordCount": defaultwordCount,
    "characterCount": defaultcharacterCount,
    "jsonSchema": defaultjsonSchema,
    "jsonKeys": defaultjsonKeys,
    "contains": defaultcontains,
    "validUrls": defaultvalidUrls,
    "webhook": defaultwebhook,
    "log": defaultlog,
    "containsCode": defaultcontainsCode,
    "alluppercase": defaultalluppercase,
    "endsWith": defaultendsWith,
    "alllowercase": defaultalllowercase,
    "modelwhitelist": defaultmodelwhitelist,
    "modelRules": defaultmodelRules,
    "jwt": defaultjwt,
    "requiredMetadataKeys": defaultrequiredMetadataKeys,
    "addPrefix": defaultaddPrefix,
    "notNull": defaultnotNull
  },
  "portkey": {
    "moderateContent": portkeymoderateContent,
    "language": portkeylanguage,
    "pii": portkeypii,
    "gibberish": portkeygibberish
  },
  "qualifire": {
    "contentModeration": qualifirecontentModeration,
    "hallucinations": qualifirehallucinations,
    "pii": qualifirepii,
    "promptInjections": qualifirepromptInjections,
    "grounding": qualifiregrounding,
    "toolUseQuality": qualifiretoolUseQuality,
    "policy": qualifirepolicy
  },
  "aporia": {
    "validateProject": aporiavalidateProject
  },
  "sydelabs": {
    "sydeguard": sydelabssydeguard
  },
  "pillar": {
    "scanPrompt": pillarscanPrompt,
    "scanResponse": pillarscanResponse
  },
  "patronus": {
    "phi": patronusphi,
    "pii": patronuspii,
    "isConcise": patronusisConcise,
    "isHelpful": patronusisHelpful,
    "isPolite": patronusisPolite,
    "noApologies": patronusnoApologies,
    "noGenderBias": patronusnoGenderBias,
    "noRacialBias": patronusnoRacialBias,
    "retrievalAnswerRelevance": patronusretrievalAnswerRelevance,
    "retrievalHallucination": patronusretrievalHallucination,
    "toxicity": patronustoxicity,
    "custom": patronuscustom
  },
  "pangea": {
    "textGuard": pangeatextGuard,
    "pii": pangeapii
  },
  "promptsecurity": {
    "protectPrompt": promptsecurityprotectPrompt,
    "protectResponse": promptsecurityprotectResponse
  },
  "panw-prisma-airs": {
    "intercept": panwPrismaAirsintercept
  },
  "walledai": {
    "walledprotect": walledaiwalledprotect
  },
  "akto": {
    "scan": aktoScan
  }
};
