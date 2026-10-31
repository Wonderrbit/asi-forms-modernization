// Parser Types — ASI_FORMS

export interface ParsedForm {
  name: string;
  version: string;
  path: string;
  blocks: ParsedBlock[];
  triggers: ParsedTrigger[];
  items: ParsedItem[];
  crossRefs: CrossRef[];
  metadata: Record<string, any>;
  blockCount: number;
  triggerCount: number;
  itemCount: number;
  loc: number;
}

export interface ParsedBlock {
  formName: string;
  name: string;
  type: 'BASE_TABLE' | 'CONTROL' | 'NON_DATABASE' | 'FROM_CLAUSE';
  tableName?: string;
  whereClause?: string;
  orderByClause?: string;
  itemCount: number;
  triggerCount: number;
  items: string[];           // item names
  triggers: string[];        // trigger names
  loc: number;
  coordinates?: { x: number; y: number; width: number; height: number };
}

export interface ParsedTrigger {
  formName: string;
  blockName?: string;
  itemName?: string;
  name: string;
  type: string;
  code: string;
  ast: any;                  // PL/SQL AST (filled by PL/SQL parser)
  complexity: {
    cyclomatic: number;
    nesting: number;
    lines: number;
    calls: number;
  };
  crossRefs: string[];
  calledProcedures: string[];
  calledPackages: string[];
  referencedTables: string[];
  referencedColumns: string[];
  status: 'raw' | 'analyzed' | 'bugs_fixed' | 'validated';
  bugsFound: number;
  bugsFixed: number;
}

export interface ParsedItem {
  formName: string;
  blockName: string;
  name: string;
  type: 'TEXT_ITEM' | 'DISPLAY_ITEM' | 'LIST_ITEM' | 'CHECKBOX' | 'RADIO_GROUP' | 'BUTTON' | 'IMAGE' | 'CHART' | 'BEAN_AREA' | 'PLUGGABLE_JAVA_COMPONENT' | 'UNKNOWN';
  dataType: 'CHAR' | 'NUMBER' | 'DATE' | 'DATETIME' | 'LONG' | 'RAW' | 'UNKNOWN';
  length: number;
  precision: number;
  scale: number;
  required: boolean;
  defaultValue?: string;
  formatMask?: string;
  lovName?: string;
  canvasName?: string;
  coordinates?: { x: number; y: number; width: number; height: number };
  triggers: string[];
  dependencies: string[];
}

export interface CrossRef {
  type: 'table' | 'procedure' | 'package' | 'item' | 'column' | 'trigger' | 'form';
  name: string;
  schema?: string;
  usage: 'read' | 'write' | 'execute' | 'reference';
  line: number;
}

export interface FMBParser {
  parse(): ParsedForm;
}