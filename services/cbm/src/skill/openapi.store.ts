import { Injectable } from '@nestjs/common';

/**
 * OpenApiStore
 *
 * Holds the OpenAPI document generated during application bootstrap.
 * Set once in main.ts after SwaggerModule.createDocument(), then injected
 * into SkillGeneratorService to produce the api-reference section of the skill.
 */
@Injectable()
export class OpenApiStore {
  private document: Record<string, any> | null = null;

  setDocument(doc: Record<string, any>): void {
    this.document = doc;
  }

  getDocument(): Record<string, any> | null {
    return this.document;
  }
}
