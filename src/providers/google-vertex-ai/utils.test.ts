import { derefer, transformGeminiToolParameters } from './utils';

/*
from enum import StrEnum
from typing import Literal
from pydantic import BaseModel, Field

class StatusEnum(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BANNED = "BANNED"

class PostalAddress(BaseModel):
    line1: str
    line2: str | None = None
    city: str
    country: str

class ContactInfo(BaseModel):
    email: str = Field(..., description="User's email address")
    phone: str | None = Field(None, description="Phone number (E.164 format)")
    address: PostalAddress = Field(..., description="Address")

class Job(BaseModel):
    title: str
    company: str
    start_date: str | None = None
    end_date: str | None = None
    currently_working: bool

class SocialAccount(BaseModel):
    platform: Literal["twitter", "linkedin", "github", "other"]
    username: str
    url: str | None = None

class Preferences(BaseModel):
    newsletter_subscribed: bool = True
    preferred_languages: list[Literal["en", "es", "fr", "de", "other"]]
    notification_frequency: Literal["daily", "weekly", "monthly"] | None = None

class Pet(BaseModel):
    name: str
    species: Literal["dog", "cat", "bird", "other"]
    age: int | None = None
    microchipped: bool | None = None

class Passport(BaseModel):
    country: str
    number: str
    expiry: str

class NationalID(BaseModel):
    country: str
    id_number: str

class EmergencyContact(BaseModel):
    name: str
    relation: str
    phone: str

class UserProfile(BaseModel):
    id: str = Field(..., description="Unique user ID")
    name: str
    status: StatusEnum
    age: int
    contact: ContactInfo
    jobs: list[Job]
    social: list[SocialAccount] | None = None
    preferences: Preferences
    pets: list[Pet] | None = None
    identity: Passport | NationalID
    emergency_contacts: list[EmergencyContact]
    notes: str | None = None

schema = UserProfile.model_json_schema()
*/

// this schema should cover almost all scenarios: enums, nested schema, null, anyOf, oneOf, etc
const userProfileSchema = {
  $defs: {
    ContactInfo: {
      properties: {
        email: {
          description: "User's email address",
          title: 'Email',
          type: 'string',
        },
        phone: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Phone number (E.164 format)',
          title: 'Phone',
        },
        address: {
          $ref: '#/$defs/PostalAddress',
          description: 'Address',
        },
      },
      required: ['email', 'address'],
      title: 'ContactInfo',
      type: 'object',
    },
    EmergencyContact: {
      properties: {
        name: {
          title: 'Name',
          type: 'string',
        },
        relation: {
          title: 'Relation',
          type: 'string',
        },
        phone: {
          title: 'Phone',
          type: 'string',
        },
      },
      required: ['name', 'relation', 'phone'],
      title: 'EmergencyContact',
      type: 'object',
    },
    Job: {
      properties: {
        title: {
          title: 'Title',
          type: 'string',
        },
        company: {
          title: 'Company',
          type: 'string',
        },
        start_date: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'Start Date',
        },
        end_date: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'End Date',
        },
        currently_working: {
          title: 'Currently Working',
          type: 'boolean',
        },
      },
      required: ['title', 'company', 'currently_working'],
      title: 'Job',
      type: 'object',
    },
    NationalID: {
      properties: {
        country: {
          title: 'Country',
          type: 'string',
        },
        id_number: {
          title: 'Id Number',
          type: 'string',
        },
      },
      required: ['country', 'id_number'],
      title: 'NationalID',
      type: 'object',
    },
    Passport: {
      properties: {
        country: {
          title: 'Country',
          type: 'string',
        },
        number: {
          title: 'Number',
          type: 'string',
        },
        expiry: {
          title: 'Expiry',
          type: 'string',
        },
      },
      required: ['country', 'number', 'expiry'],
      title: 'Passport',
      type: 'object',
    },
    Pet: {
      properties: {
        name: {
          title: 'Name',
          type: 'string',
        },
        species: {
          enum: ['dog', 'cat', 'bird', 'other'],
          title: 'Species',
          type: 'string',
        },
        age: {
          anyOf: [
            {
              type: 'integer',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'Age',
        },
        microchipped: {
          anyOf: [
            {
              type: 'boolean',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'Microchipped',
        },
      },
      required: ['name', 'species'],
      title: 'Pet',
      type: 'object',
    },
    PostalAddress: {
      properties: {
        line1: { title: 'Line1', type: 'string' },
        line2: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          default: null,
          title: 'Line2',
        },
        city: { title: 'City', type: 'string' },
        country: { title: 'Country', type: 'string' },
      },
      required: ['line1', 'city', 'country'],
      title: 'PostalAddress',
      type: 'object',
    },
    Preferences: {
      properties: {
        newsletter_subscribed: {
          default: true,
          title: 'Newsletter Subscribed',
          type: 'boolean',
        },
        preferred_languages: {
          items: {
            enum: ['en', 'es', 'fr', 'de', 'other'],
            type: 'string',
          },
          title: 'Preferred Languages',
          type: 'array',
        },
        notification_frequency: {
          anyOf: [
            {
              enum: ['daily', 'weekly', 'monthly'],
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'Notification Frequency',
        },
      },
      required: ['preferred_languages'],
      title: 'Preferences',
      type: 'object',
    },
    SocialAccount: {
      properties: {
        platform: {
          enum: ['twitter', 'linkedin', 'github', 'other'],
          title: 'Platform',
          type: 'string',
        },
        username: {
          title: 'Username',
          type: 'string',
        },
        url: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          title: 'Url',
        },
      },
      required: ['platform', 'username'],
      title: 'SocialAccount',
      type: 'object',
    },
    StatusEnum: {
      enum: ['ACTIVE', 'INACTIVE', 'BANNED'],
      title: 'StatusEnum',
      type: 'string',
    },
  },
  properties: {
    id: {
      description: 'Unique user ID',
      title: 'Id',
      type: 'string',
    },
    name: {
      title: 'Name',
      type: 'string',
    },
    status: {
      $ref: '#/$defs/StatusEnum',
    },
    age: {
      title: 'Age',
      type: 'integer',
    },
    contact: {
      $ref: '#/$defs/ContactInfo',
    },
    jobs: {
      items: {
        $ref: '#/$defs/Job',
      },
      title: 'Jobs',
      type: 'array',
    },
    social: {
      anyOf: [
        {
          items: {
            $ref: '#/$defs/SocialAccount',
          },
          type: 'array',
        },
        {
          type: 'null',
        },
      ],
      default: null,
      title: 'Social',
    },
    preferences: {
      $ref: '#/$defs/Preferences',
    },
    pets: {
      anyOf: [
        {
          items: {
            $ref: '#/$defs/Pet',
          },
          type: 'array',
        },
        {
          type: 'null',
        },
      ],
      default: null,
      title: 'Pets',
    },
    identity: {
      anyOf: [
        {
          $ref: '#/$defs/Passport',
        },
        {
          $ref: '#/$defs/NationalID',
        },
      ],
      title: 'Identity',
    },
    emergency_contacts: {
      items: {
        $ref: '#/$defs/EmergencyContact',
      },
      title: 'Emergency Contacts',
      type: 'array',
    },
    notes: {
      anyOf: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
      default: null,
      title: 'Notes',
    },
  },
  required: [
    'id',
    'name',
    'status',
    'age',
    'contact',
    'jobs',
    'preferences',
    'identity',
    'emergency_contacts',
  ],
  title: 'UserProfile',
  type: 'object',
};

describe('derefer', () => {
  let derefed: any;
  beforeAll(() => {
    derefed = derefer(userProfileSchema);
  });

  it('inlines $ref for nested object property (contact)', () => {
    expect(derefed.properties.contact.type).toBe('object');
    expect(derefed.properties.contact.properties.email.type).toBe('string');
    expect(derefed.properties.contact.properties.address.type).toBe('object');
  });

  it('inlines $ref for nested model inside ContactInfo (address -> PostalAddress)', () => {
    const contact = derefed.properties.contact;
    expect(contact.type).toBe('object');

    const addr = contact.properties.address;
    // PostalAddress should be fully inlined
    expect(addr.type).toBe('object');
    expect(addr.properties.line1.type).toBe('string');
    expect(addr.properties.city.type).toBe('string');
    expect(addr.properties.country.type).toBe('string');
  });

  it('inlines $ref for enum via $defs (status)', () => {
    expect(derefed.properties.status.type).toBe('string');
    expect(derefed.properties.status.enum).toEqual([
      'ACTIVE',
      'INACTIVE',
      'BANNED',
    ]);
    expect(derefed.properties.status.format).toBeUndefined();
  });

  it('inlines $ref in array items (jobs.items)', () => {
    const jobItem = derefed.properties.jobs.items;
    expect(jobItem.type).toBe('object');
    expect(jobItem.properties.title.type).toBe('string');
    expect(jobItem.properties.company.type).toBe('string');
  });

  it('inlines $ref for union members in anyOf (identity = Passport | NationalID)', () => {
    const union = derefed.properties.identity.anyOf;
    expect(Array.isArray(union)).toBe(true);
    expect(union.length).toBe(2);

    const passport = union[0];
    expect(passport.type).toBe('object');
    expect(passport.properties.country.type).toBe('string');
    expect(passport.properties.number.type).toBe('string');

    const nationalId = union[1];
    expect(nationalId.type).toBe('object');
    expect(nationalId.properties.country.type).toBe('string');
    expect(nationalId.properties.id_number.type).toBe('string');
  });

  it('inlines $ref inside anyOf (pets: list[Pet] | null)', () => {
    const petsAnyOf = derefed.properties.pets.anyOf as any[];
    const arr = petsAnyOf.find((x) => x.type === 'array');
    expect(arr).toBeDefined();
    expect(arr.items.type).toBe('object');
    expect(arr.items.properties.species.enum).toEqual([
      'dog',
      'cat',
      'bird',
      'other',
    ]);
    expect(petsAnyOf.some((x) => x && x.type === 'null')).toBe(true);
  });

  it('inlines $ref inside anyOf (social: list[SocialAccount] | null)', () => {
    const socialAnyOf = derefed.properties.social.anyOf as any[];
    const arr = socialAnyOf.find((x) => x.type === 'array');
    expect(arr).toBeDefined();
    expect(arr.items.type).toBe('object');
    expect(arr.items.properties.platform.enum).toEqual([
      'twitter',
      'linkedin',
      'github',
      'other',
    ]);
    expect(socialAnyOf.some((x) => x && x.type === 'null')).toBe(true);
  });

  it('does not alter non-$ref scalar fields (name)', () => {
    expect(derefed.properties.name.type).toBe('string');
  });

  it('keeps $defs at the root (derefer does not remove it)', () => {
    expect(derefed.$defs).toBeDefined();
  });
});

describe('transformGeminiToolParameters', () => {
  let transformed: any;
  beforeAll(() => {
    transformed = transformGeminiToolParameters(userProfileSchema);
  });

  it('removes $defs from the root after dereferencing', () => {
    expect(transformed.$defs).toBeUndefined();
  });

  it('flattens anyOf [string, null] to { type: string, nullable: true } and preserves metadata (notes)', () => {
    expect(transformed.properties.notes).toEqual({
      type: 'string',
      nullable: true,
      title: 'Notes',
      default: null,
    });
  });

  it('flattens anyOf [string, null] in nested object and preserves metadata (contact.phone)', () => {
    expect(transformed.properties.contact.properties.phone).toEqual({
      type: 'string',
      nullable: true,
      description: 'Phone number (E.164 format)',
      title: 'Phone',
      default: null,
    });
  });

  it('keeps nested model flattened correctly after deref (contact.address)', () => {
    const addr = transformed.properties.contact.properties.address;
    expect(addr.type).toBe('object');
    expect(addr.properties.line1.type).toBe('string');
    // line2 remains nullable string
    expect(addr.properties.line2).toEqual({
      type: 'string',
      nullable: true,
      title: 'Line2',
      default: null,
    });
  });

  it('flattens anyOf [array-of-model, null] to array schema with nullable: true and preserves metadata (pets)', () => {
    const pets = transformed.properties.pets;
    expect(pets.type).toBe('array');
    expect(pets.nullable).toBe(true);
    expect(pets.title).toBe('Pets');
    expect(pets.default).toBe(null);
    expect(pets.items.type).toBe('object');
    expect(pets.items.properties.name.type).toBe('string');
  });

  it('keeps multi-type unions without null as anyOf (identity = Passport | NationalID)', () => {
    const identity = transformed.properties.identity;
    const union = (identity.anyOf || identity.oneOf) as any[];
    expect(Array.isArray(union)).toBe(true);
    expect(union.length).toBe(2);
    expect(identity.nullable).toBeUndefined();
    expect(union[0].type).toBe('object');
    expect(union[1].type).toBe('object');
  });

  it('retains default values/titles when flattening (notes, contact.phone)', () => {
    expect(transformed.properties.notes.default).toBe(null);
    expect(transformed.properties.notes.title).toBe('Notes');

    const phone = transformed.properties.contact.properties.phone;
    expect(phone.default).toBe(null);
    expect(phone.title).toBe('Phone');
  });

  it('does not alter fields with no null union (jobs.items.currently_working)', () => {
    const cw = transformed.properties.jobs.items.properties.currently_working;
    expect(cw.type).toBe('boolean');
    expect(cw.nullable).toBeUndefined();
  });

  it('preserves the required list at the root', () => {
    expect(transformed.required).toEqual([
      'id',
      'name',
      'status',
      'age',
      'contact',
      'jobs',
      'preferences',
      'identity',
      'emergency_contacts',
    ]);
  });
});

import { transformGenerationConfig as transformVertexGenerationConfig } from './transformGenerationConfig';
import {
  transformGenerationConfig as transformGoogleGenerationConfig,
  GoogleChatCompleteStreamChunkTransform as GoogleStudioStreamChunkTransform,
  GoogleChatCompleteResponseTransform as GoogleStudioResponseTransform,
} from '../google/chatComplete';
import {
  GoogleChatCompleteStreamChunkTransform as VertexStreamChunkTransform,
  GoogleChatCompleteResponseTransform as VertexResponseTransform,
} from './chatComplete';

describe('transformGenerationConfig thinkingConfig & reasoning_effort routing', () => {
  it.each([
    {
      model: 'gemini-3.5-flash',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingLevel: 'minimal' },
    },
    {
      model: 'au.gemini-3.5-flash',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingLevel: 'minimal' },
    },
    {
      model: 'eu.gemini-3.5-flash',
      reasoning_effort: 'minimal',
      expected: { includeThoughts: true, thinkingLevel: 'minimal' },
    },
    {
      model: 'gemini-3.5-pro',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingLevel: 'low' },
    },
    {
      model: 'gemini-3.5-pro',
      reasoning_effort: 'minimal',
      expected: { includeThoughts: true, thinkingLevel: 'low' },
    },
    {
      model: 'gemini-3.1-pro',
      reasoning_effort: 'minimal',
      expected: { includeThoughts: true, thinkingLevel: 'low' },
    },
    {
      model: 'us.gemini-3.1-pro',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingLevel: 'low' },
    },
    {
      model: 'gemini-3.5-pro',
      reasoning_effort: 'high',
      expected: { includeThoughts: true, thinkingLevel: 'high' },
    },
    {
      model: 'gemini-2.5-flash',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingBudget: 0 },
    },
    {
      model: 'gemini-2.5-pro',
      reasoning_effort: 'none',
      expected: { includeThoughts: false, thinkingBudget: 128 },
    },
    {
      model: 'gemini-2.5-flash',
      reasoning_effort: 'medium',
      expected: { includeThoughts: true, thinkingBudget: 8192 },
    },
  ])(
    'maps reasoning_effort="$reasoning_effort" on $model to $expected',
    ({ model, reasoning_effort, expected }) => {
      expect(
        transformVertexGenerationConfig({ model, reasoning_effort })
          .thinkingConfig
      ).toEqual(expected);
      expect(
        transformGoogleGenerationConfig({ model, reasoning_effort })
          .thinkingConfig
      ).toEqual(expected);
    }
  );

  it.each([
    {
      model: 'gemini-3.5-flash',
      thinking: { type: 'disabled' },
      expected: { includeThoughts: false, thinkingLevel: 'minimal' },
    },
    {
      model: 'au.gemini-3.5-flash',
      thinking: { type: 'disabled', budget_tokens: 0 },
      expected: { includeThoughts: false, thinkingLevel: 'minimal' },
    },
    {
      model: 'gemini-3.5-pro',
      thinking: { type: 'disabled' },
      expected: { includeThoughts: false, thinkingLevel: 'low' },
    },
    {
      model: 'gemini-2.5-flash',
      thinking: { type: 'disabled' },
      expected: { includeThoughts: false, thinkingBudget: 0 },
    },
    {
      model: 'gemini-2.5-pro',
      thinking: { type: 'disabled' },
      expected: { includeThoughts: false, thinkingBudget: 128 },
    },
  ])(
    'maps thinking=$thinking on $model to $expected',
    ({ model, thinking, expected }) => {
      expect(
        transformVertexGenerationConfig({ model, thinking }).thinkingConfig
      ).toEqual(expected);
      expect(
        transformGoogleGenerationConfig({ model, thinking }).thinkingConfig
      ).toEqual(expected);
    }
  );
});

describe('Gemini streaming and non-streaming usageMetadata', () => {
  it('emits usage on streaming chunks when candidatesTokenCount is 0 or omitted and includes thoughtsTokenCount in completion_tokens', () => {
    const rawChunk = `data: ${JSON.stringify({
      modelVersion: 'gemini-3.5-flash',
      candidates: [{ content: { role: 'model' }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: {
        promptTokenCount: 200,
        thoughtsTokenCount: 512,
        cachedContentTokenCount: 150,
        totalTokenCount: 712,
      },
    })}\n\n`;

    const vertexOut = VertexStreamChunkTransform(rawChunk, 'id-1', {}, true);
    const vertexParsed = JSON.parse(vertexOut.replace(/^data: /, '').trim());
    expect(vertexParsed.usage).toEqual({
      prompt_tokens: 200,
      completion_tokens: 512,
      total_tokens: 712,
      completion_tokens_details: {
        reasoning_tokens: 512,
        audio_tokens: undefined,
      },
      prompt_tokens_details: {
        cached_tokens: 150,
        audio_tokens: undefined,
      },
    });

    const studioOut = GoogleStudioStreamChunkTransform(
      rawChunk,
      'id-1',
      {},
      true
    );
    const studioParsed = JSON.parse(studioOut.replace(/^data: /, '').trim());
    expect(studioParsed.usage).toEqual(vertexParsed.usage);
  });

  it('includes thoughtsTokenCount in completion_tokens for non-streaming responses', () => {
    const response: any = {
      modelVersion: 'gemini-3.5-flash',
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'hello' }],
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 300,
        cachedContentTokenCount: 40,
        totalTokenCount: 450,
      },
    };

    const vertexRes: any = VertexResponseTransform(
      response,
      200,
      new Headers(),
      true
    );
    expect(vertexRes.usage.completion_tokens).toBe(350);
    expect(vertexRes.usage.completion_tokens_details.reasoning_tokens).toBe(
      300
    );
    expect(vertexRes.usage.prompt_tokens_details.cached_tokens).toBe(40);

    const studioRes: any = GoogleStudioResponseTransform(
      response,
      200,
      new Headers(),
      true
    );
    expect(studioRes.usage.completion_tokens).toBe(350);
    expect(studioRes.usage.completion_tokens_details.reasoning_tokens).toBe(
      300
    );
    expect(studioRes.usage.prompt_tokens_details.cached_tokens).toBe(40);
  });
});
