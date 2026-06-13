/**
 * Tree-sitter query patterns for code extraction
 *
 * Simplified queries that focus on reliable extraction.
 * Complex patterns (decorators with args, etc.) can be added incrementally.
 *
 * WASM Migration (SS-10):
 * - Query creation uses new Query(language, source) constructor
 * - Language object passed as parameter to avoid circular dependency
 * - NO imports from treeSitter.ts - breaks circular dependency completely
 */

import { Query, type Language as TSLanguage } from 'web-tree-sitter';

type Language = 'python' | 'typescript' | 'tsx' | 'javascript' | 'go';

/**
 * Query patterns organized by language and query type
 */
export const QUERIES: Record<Language, Record<string, string>> = {
  python: {
    functions: `(function_definition name: (identifier) @function.name)`,
    classes: `(class_definition name: (identifier) @class.name)`,
    decorators: `(decorator) @decorator`,
    imports: `(import_from_statement module_name: (dotted_name) @import.module)
(import_statement name: (dotted_name) @import.module)`,

    // Pattern detection queries
    tryExcept: `(try_statement
  (block) @try.body
  (except_clause) @except
)`,

    baseModelClass: `(class_definition
  name: (identifier) @class.name
  (argument_list
    (identifier) @superclass
  )
)`,

    specificImport: `(import_from_statement
  module_name: (dotted_name) @module
  (import_names
    (imported_name (identifier) @name)
  )
)`,

    asyncDef: `(function_definition
  name: (identifier) @function.name
)`,

    // Convention detection queries
    variables: `(assignment left: (identifier) @variable.name)`,
  },

  typescript: {
    functions: `(function_declaration name: (identifier) @function.name)
(method_definition name: (property_identifier) @method.name)`,
    classes: `(class_declaration name: (type_identifier) @class.name)`,
    interfaces: `(interface_declaration name: (type_identifier) @interface.name)`,
    exports: `(export_statement) @export`,
    decorators: `(decorator) @decorator`,
    imports: `(import_statement source: (string) @import.module)`,

    // Pattern detection queries
    tryCatch: `(try_statement
  (block) @try.body
  (catch_clause) @catch
)`,

    memberCall: `(call_expression
  function: (member_expression
    object: (identifier) @obj
    property: (property_identifier) @method
  )
)`,

    // The non-field `(import_clause …)` child must precede the `source:`
    // field to match the grammar's child order; leading with the field triggers
    // a "Bad pattern structure" compile error. `import_specifier.name` is a
    // field, so capture it as `name: (identifier)`. Each specifier yields its
    // own match (sharing the same `@source`), which extractNamedImports merges
    // back together by the source line.
    namedImport: `(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (identifier) @name)))
  source: (string) @source)`,

    // CommonJS require('x') AND dynamic import('x'). Both are call_expressions:
    // require → function is an identifier (filtered to "require" in code, since
    // web-tree-sitter predicates aren't applied here); dynamic import → function
    // is the `import` keyword node. The string argument is captured as
    // @import.module so the same edge-builder path consumes it. Lets pure-CJS
    // repos (express) and lazy-loaded modules produce a real import graph.
    cjsDynamicImports: `(call_expression
  function: (identifier) @callee
  arguments: (arguments (string) @import.module))
(call_expression
  function: (import)
  arguments: (arguments (string) @import.module))`,

    // Convention detection queries
    // Identical to the tsx.variables entry — both grammars share the same base
    // and use the same lexical_declaration → variable_declarator structure.
    variables: `(lexical_declaration
  (variable_declarator
    name: (identifier) @variable.name))`,
  },

  tsx: {
    functions: `(function_declaration name: (identifier) @function.name)
(method_definition name: (property_identifier) @method.name)`,
    classes: `(class_declaration name: (type_identifier) @class.name)`,
    interfaces: `(interface_declaration name: (type_identifier) @interface.name)`,
    exports: `(export_statement) @export`,
    decorators: `(decorator) @decorator`,
    imports: `(import_statement source: (string) @import.module)`,

    // Pattern detection queries (same as TypeScript)
    tryCatch: `(try_statement
  (block) @try.body
  (catch_clause) @catch
)`,

    memberCall: `(call_expression
  function: (member_expression
    object: (identifier) @obj
    property: (property_identifier) @method
  )
)`,

    // See the typescript.namedImport note: clause-before-source ordering and
    // the `name:` field are required for this query to compile and group.
    namedImport: `(import_statement
  (import_clause
    (named_imports
      (import_specifier
        name: (identifier) @name)))
  source: (string) @source)`,

    // See typescript.cjsDynamicImports — require()/dynamic import() capture.
    cjsDynamicImports: `(call_expression
  function: (identifier) @callee
  arguments: (arguments (string) @import.module))
(call_expression
  function: (import)
  arguments: (arguments (string) @import.module))`,

    // Convention detection queries
    variables: `(lexical_declaration
  (variable_declarator
    name: (identifier) @variable.name))`,
  },

  javascript: {
    functions: `(function_declaration name: (identifier) @function.name)
(method_definition name: (property_identifier) @method.name)`,
    classes: `(class_declaration name: (identifier) @class.name)`,
    exports: `(export_statement) @export`,
    imports: `(import_statement source: (string) @import.module)`,

    // Pattern detection queries
    tryCatch: `(try_statement
  (block) @try.body
  (catch_clause) @catch
)`,

    memberCall: `(call_expression
  function: (member_expression
    object: (identifier) @obj
    property: (property_identifier) @method
  )
)`,

    // CommonJS require('x') AND dynamic import('x') — the dominant import form
    // in pure-CJS JavaScript repos (express). See typescript.cjsDynamicImports.
    cjsDynamicImports: `(call_expression
  function: (identifier) @callee
  arguments: (arguments (string) @import.module))
(call_expression
  function: (import)
  arguments: (arguments (string) @import.module))`,

    // Convention detection queries
    variables: `(variable_declaration
  (variable_declarator
    name: (identifier) @variable.name))`,
  },

  go: {
    functions: `(function_declaration name: (identifier) @function.name)`,
    methods: `(method_declaration name: (field_identifier) @method.name)`,
    structs: `(type_spec name: (type_identifier) @struct.name type: (struct_type))`,
    imports: `(import_spec path: (interpreted_string_literal) @import.path)`,

    // Pattern detection queries
    ifErrNotNil: `(if_statement
  condition: (binary_expression
    left: (identifier) @var
    operator: "!="
    right: (identifier) @nil
  )
)`,

    structWithTags: `(type_spec
  name: (type_identifier) @struct.name
  type: (struct_type
    (field_declaration
      tag: (raw_string_literal) @tag
    )
  )
)`,

    // Convention detection queries
    variables: `(var_declaration
  (var_spec
    name: (identifier) @variable.name))`,

    shortVars: `(short_var_declaration
  left: (expression_list
    (identifier) @variable.name))`,
  },
};

/**
 * Valid query types per language
 */
export type QueryType =
  | 'functions'
  | 'classes'
  | 'imports'
  | 'decorators'
  | 'exports'
  | 'interfaces'
  | 'methods'
  | 'structs'
  // Pattern detection queries
  | 'tryExcept'      // Python
  | 'baseModelClass' // Python
  | 'specificImport' // Python
  | 'asyncDef'       // Python
  | 'tryCatch'       // TypeScript/JavaScript
  | 'memberCall'     // TypeScript/JavaScript
  | 'namedImport'    // TypeScript
  | 'cjsDynamicImports' // TypeScript/JavaScript — require() + dynamic import()
  | 'ifErrNotNil'    // Go
  | 'structWithTags' // Go
  // Convention detection queries
  | 'variables'      // All languages
  | 'shortVars';     // Go only

/**
 * Query compilation cache
 *
 * Compiles S-expression queries once per language+type, caches for reuse.
 *
 * WASM Migration (SS-10):
 * - Uses new Query(language, source) constructor
 * - Language object passed as parameter (no dependency on ParserManager)
 * - Stays SYNC - no async cascade
 */
export class QueryCache {
  private compiled = new Map<string, Query>();

  /**
   * Get compiled query for language and query type
   *
   * SYNC method - Language object passed as parameter to avoid circular dependency
   *
   * @param language - Language name ('python', 'typescript', etc.)
   * @param queryType - Type of query ('functions', 'classes', etc.)
   * @param tsLanguage - Pre-loaded WASM Language object from ParserManager
   * @returns Compiled query object
   *
   * @throws Error if query not defined for language+type
   */
  getQuery(language: Language, queryType: QueryType, tsLanguage: TSLanguage): Query {
    const key = `${language}:${queryType}`;

    if (!this.compiled.has(key)) {
      const queryString = QUERIES[language]?.[queryType];

      if (!queryString) {
        throw new Error(`No query defined for ${key}`);
      }

      // Create query using new Query(language, source) (WASM API)
      const compiled = new Query(tsLanguage, queryString);
      this.compiled.set(key, compiled);
    }

    return this.compiled.get(key)!;
  }

  clearCache(): void {
    this.compiled.clear();
  }

  getCacheSize(): number {
    return this.compiled.size;
  }
}

// Export singleton instance
export const queryCache = new QueryCache();
