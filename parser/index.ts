// .fmb Binary Parser — ASI_FORMS
// Parses Oracle Forms 10g/11g .fmb binary files into structured AST + Neo4j-ready graph nodes.
// Based on reverse-engineered .fmb format (no official spec).

import { readFileSync } from 'fs';
import { FMBParser, ParsedForm, ParsedBlock, ParsedTrigger, ParsedItem } from './types';

export class FMBAbstractParser implements FMBParser {
  private buffer: Buffer;
  private offset: number = 0;
  private form: ParsedForm;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.form = this.initForm();
  }

  parse(): ParsedForm {
    this.validateHeader();
    this.parseModules();
    this.parseBlocks();
    this.parseTriggers();
    this.parseItems();
    this.parseCrossReferences();
    this.form.blockCount = this.form.blocks.length;
    this.form.triggerCount = this.form.triggers.length;
    this.form.itemCount = this.form.items.length;
    this.form.loc = this.calculateLOC();
    return this.form;
  }

  private initForm(): ParsedForm {
    return {
      name: '',
      version: '',
      path: '',
      blocks: [],
      triggers: [],
      items: [],
      crossRefs: [],
      metadata: {}
    };
  }

  private validateHeader(): void {
    // .fmb magic bytes: 0x00 0x00 0x00 0x0C (varies by version)
    const magic = this.buffer.subarray(0, 4);
    if (!this.isValidFMBHeader(magic)) {
      throw new Error('Invalid .fmb file: unrecognized header');
    }
    this.offset = 4;
  }

  private isValidFMBHeader(magic: Buffer): boolean {
    // Known Oracle Forms 10g/11g headers
    const knownHeaders = [
      Buffer.from([0x00, 0x00, 0x00, 0x0C]),
      Buffer.from([0x00, 0x00, 0x01, 0x00]),
      Buffer.from([0x46, 0x4D, 0x42, 0x00]) // "FMB\0"
    ];
    return knownHeaders.some(h => h.equals(magic));
  }

  private parseModules(): void {
    // Module header: form name, version, timestamp
    this.form.name = this.readNullTerminatedString();
    this.form.version = this.readNullTerminatedString();
    this.form.metadata.createdAt = this.readTimestamp();
    this.form.metadata.modifiedAt = this.readTimestamp();
  }

  private parseBlocks(): void {
    const blockCount = this.readUInt32();
    for (let i = 0; i < blockCount; i++) {
      const block = this.parseBlock();
      this.form.blocks.push(block);
    }
  }

  private parseBlock(): ParsedBlock {
    const name = this.readNullTerminatedString();
    const type = this.readBlockType();
    const tableName = this.readNullTerminatedString() || undefined;
    const whereClause = this.readNullTerminatedString() || undefined;
    const orderByClause = this.readNullTerminatedString() || undefined;
    
    const itemCount = this.readUInt16();
    const items: string[] = [];
    for (let j = 0; j < itemCount; j++) {
      items.push(this.readNullTerminatedString());
    }

    const triggerCount = this.readUInt16();
    const triggers: string[] = [];
    for (let j = 0; j < triggerCount; j++) {
      triggers.push(this.readNullTerminatedString());
    }

    return {
      formName: this.form.name,
      name,
      type,
      tableName,
      whereClause,
      orderByClause,
      itemCount,
      triggerCount,
      items,
      triggers,
      loc: 0, // calculated later
      coordinates: this.readCoordinates()
    };
  }

  private parseTriggers(): void {
    const triggerCount = this.readUInt32();
    for (let i = 0; i < triggerCount; i++) {
      const trigger = this.parseTrigger();
      this.form.triggers.push(trigger);
    }
  }

  private parseTrigger(): ParsedTrigger {
    const formName = this.form.name;
    const blockName = this.readNullTerminatedString() || undefined;
    const itemName = this.readNullTerminatedString() || undefined;
    const name = this.readNullTerminatedString();
    const type = this.readTriggerType();
    const code = this.readPLSQLCode();
    
    return {
      formName,
      blockName,
      itemName,
      name,
      type,
      code,
      ast: null, // filled by PL/SQL parser later
      complexity: this.calculateComplexity(code),
      crossRefs: [],
      calledProcedures: [],
      calledPackages: [],
      referencedTables: [],
      referencedColumns: [],
      status: 'raw',
      bugsFound: 0,
      bugsFixed: 0
    };
  }

  private parseItems(): void {
    const itemCount = this.readUInt32();
    for (let i = 0; i < itemCount; i++) {
      const item = this.parseItem();
      this.form.items.push(item);
    }
  }

  private parseItem(): ParsedItem {
    const formName = this.form.name;
    const blockName = this.readNullTerminatedString();
    const name = this.readNullTerminatedString();
    const type = this.readItemType();
    const dataType = this.readDataType();
    const length = this.readUInt16();
    const precision = this.readUInt8();
    const scale = this.readUInt8();
    const required = this.readBoolean();
    const defaultValue = this.readNullTerminatedString() || undefined;
    const formatMask = this.readNullTerminatedString() || undefined;
    const lovName = this.readNullTerminatedString() || undefined;
    const canvasName = this.readNullTerminatedString() || undefined;
    
    const triggerCount = this.readUInt16();
    const triggers: string[] = [];
    for (let j = 0; j < triggerCount; j++) {
      triggers.push(this.readNullTerminatedString());
    }

    return {
      formName,
      blockName,
      name,
      type,
      dataType,
      length,
      precision,
      scale,
      required,
      defaultValue,
      formatMask,
      lovName,
      canvasName,
      coordinates: this.readCoordinates(),
      triggers,
      dependencies: []
    };
  }

  private parseCrossReferences(): void {
    // Cross-references are embedded in trigger code and object properties
    // This is a simplified extraction; full implementation uses PL/SQL parser
    for (const trigger of this.form.triggers) {
      const refs = this.extractCrossReferences(trigger.code);
      trigger.crossRefs = refs.map(r => r.name);
      trigger.calledProcedures = refs.filter(r => r.type === 'procedure').map(r => r.name);
      trigger.calledPackages = refs.filter(r => r.type === 'package').map(r => r.name);
      trigger.referencedTables = refs.filter(r => r.type === 'table').map(r => r.name);
      trigger.referencedColumns = refs.filter(r => r.type === 'column').map(r => r.name);
      this.form.crossRefs.push(...refs);
    }
  }

  // ============================================
  // LOW-LEVEL READING HELPERS
  // ============================================

  private readUInt8(): number {
    const val = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return val;
  }

  private readUInt16(): number {
    const val = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  private readUInt32(): number {
    const val = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return val;
  }

  private readNullTerminatedString(): string {
    let end = this.offset;
    while (end < this.buffer.length && this.buffer[end] !== 0x00) {
      end++;
    }
    const str = this.buffer.subarray(this.offset, end).toString('utf-8');
    this.offset = end + 1; // skip null terminator
    return str;
  }

  private readTimestamp(): string {
    // Oracle Forms timestamp: 7 bytes (century, year, month, day, hour, min, sec)
    if (this.offset + 7 > this.buffer.length) return '';
    const bytes = this.buffer.subarray(this.offset, this.offset + 7);
    this.offset += 7;
    const century = bytes[0];
    const year = bytes[1];
    const month = bytes[2];
    const day = bytes[3];
    const hour = bytes[4];
    const minute = bytes[5];
    const second = bytes[6];
    return `${century}${year.toString().padStart(2,'0')}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}T${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:${second.toString().padStart(2,'0')}`;
  }

  private readCoordinates(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.readInt16(),
      y: this.readInt16(),
      width: this.readUInt16(),
      height: this.readUInt16()
    };
  }

  private readInt16(): number {
    const val = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  private readBoolean(): boolean {
    return this.readUInt8() !== 0;
  }

  private readBlockType(): ParsedBlock['type'] {
    const typeCode = this.readUInt8();
    const types: ParsedBlock['type'][] = ['BASE_TABLE', 'CONTROL', 'NON_DATABASE', 'FROM_CLAUSE'];
    return types[typeCode] || 'CONTROL';
  }

  private readTriggerType(): ParsedTrigger['type'] {
    const typeCode = this.readUInt8();
    const types: ParsedTrigger['type'][] = [
      'PRE_FORM', 'POST_FORM', 'PRE_BLOCK', 'POST_BLOCK',
      'PRE_RECORD', 'POST_RECORD', 'PRE_INSERT', 'POST_INSERT',
      'PRE_UPDATE', 'POST_UPDATE', 'PRE_DELETE', 'POST_DELETE',
      'WHEN_VALIDATE_ITEM', 'WHEN_VALIDATE_RECORD',
      'KEY_EXIT', 'KEY_COMMIT', 'KEY_NEXT_ITEM', 'KEY_PREV_ITEM',
      'WHEN_BUTTON_PRESSED', 'WHEN_WINDOW_ACTIVATED', 'WHEN_WINDOW_CLOSED',
      'ON_ERROR', 'ON_MESSAGE', 'PRE_QUERY', 'POST_QUERY',
      'ON_INSERT', 'ON_UPDATE', 'ON_DELETE', 'ON_LOCK',
      'CUSTOM'
    ];
    return types[typeCode] || 'CUSTOM';
  }

  private readItemType(): ParsedItem['type'] {
    const typeCode = this.readUInt8();
    const types: ParsedItem['type'][] = [
      'TEXT_ITEM', 'DISPLAY_ITEM', 'LIST_ITEM', 'CHECKBOX',
      'RADIO_GROUP', 'BUTTON', 'IMAGE', 'CHART', 'BEAN_AREA',
      'PLUGGABLE_JAVA_COMPONENT', 'UNKNOWN'
    ];
    return types[typeCode] || 'UNKNOWN';
  }

  private readDataType(): ParsedItem['dataType'] {
    const typeCode = this.readUInt8();
    const types: ParsedItem['dataType'][] = ['CHAR', 'NUMBER', 'DATE', 'DATETIME', 'LONG', 'RAW', 'UNKNOWN'];
    return types[typeCode] || 'UNKNOWN';
  }

  private readPLSQLCode(): string {
    // PL/SQL code is stored as length-prefixed string
    const length = this.readUInt32();
    if (length === 0 || length > 1000000) return ''; // sanity check
    const code = this.buffer.subarray(this.offset, this.offset + length).toString('utf-8');
    this.offset += length;
    return code;
  }

  private calculateComplexity(code: string): { cyclomatic: number; nesting: number; lines: number; calls: number } {
    // Simplified complexity calculation
    const lines = code.split('\n').length;
    const cyclomatic = (code.match(/\b(IF|ELSE|ELSIF|LOOP|FOR|WHILE|CASE|WHEN|EXCEPTION|GOTO)\b/gi) || []).length + 1;
    const nesting = this.calculateMaxNesting(code);
    const calls = (code.match(/\b[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*\s*\(/gi) || []).length; // pkg.proc()
    return { cyclomatic, nesting, lines, calls };
  }

  private calculateMaxNesting(code: string): number {
    let max = 0;
    let current = 0;
    const keywords = ['BEGIN', 'LOOP', 'IF', 'FOR', 'WHILE', 'DECLARE'];
    const endKeywords = ['END', 'END LOOP', 'END IF', 'END FOR', 'END WHILE'];
    // Simplified - real implementation would parse properly
    for (const line of code.split('\n')) {
      const upper = line.trim().toUpperCase();
      if (keywords.some(k => upper.startsWith(k))) current++;
      if (endKeywords.some(k => upper.startsWith(k))) current = Math.max(0, current - 1);
      max = Math.max(max, current);
    }
    return max;
  }

  private extractCrossReferences(code: string): Array<{type: string; name: string; schema?: string; usage: string; line: number}> {
    const refs: Array<{type: string; name: string; schema?: string; usage: string; line: number}> = [];
    const lines = code.split('\n');
    
    // Table references: FROM table, JOIN table, UPDATE table, INSERT INTO table, DELETE FROM table
    const tableRegex = /\b(FROM|JOIN|UPDATE|INSERT INTO|DELETE FROM)\s+([A-Z_][A-Z0-9_]*\.)?([A-Z_][A-Z0-9_]*)/gi;
    // Procedure calls: pkg.proc() or proc()
    const procRegex = /\b([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*\(/g;
    // Package references: pkg.variable or pkg.constant
    const pkgRegex = /\b([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\b/g;
    // Column references: table.column or :block.item
    const colRegex = /\b([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\b/g;
    // Item references: :block.item
    const itemRegex = /:([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Tables
      let match;
      while ((match = tableRegex.exec(line)) !== null) {
        const schema = match[2]?.replace('.', '') || undefined;
        refs.push({ type: 'table', name: match[3], schema, usage: 'read', line: lineNum });
      }

      // Procedures
      while ((match = procRegex.exec(line)) !== null) {
        refs.push({ type: 'procedure', name: `${match[1]}.${match[2]}`, schema: match[1], usage: 'execute', line: lineNum });
      }

      // Items
      while ((match = itemRegex.exec(line)) !== null) {
        refs.push({ type: 'item', name: `${match[1]}.${match[2]}`, usage: 'reference', line: lineNum });
      }
    }

    return refs;
  }

  private calculateLOC(): number {
    return this.form.triggers.reduce((sum, t) => sum + t.complexity.lines, 0);
  }
}

// ============================================
// CLI ENTRY POINT
// ============================================

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node parser.js <path-to-.fmb-file>');
    process.exit(1);
  }

  const buffer = readFileSync(filePath);
  const parser = new FMBAbstractParser(buffer);
  const result = parser.parse();
  
  console.log(JSON.stringify(result, null, 2));
}

export { FMBAbstractParser };