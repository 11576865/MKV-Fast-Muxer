/*
 * Exploratory BSD-3-Clause adapter over the Matroska Foundation C API.
 * Upstream dependency: Matroska-Org/foundation-source @
 * d69761114b79c1dfcb2226ceca84452835e745c3 (BSD-3-Clause).
 *
 * This is NOT a second EBML parser: element identity, size, parent scope,
 * and traversal are provided by libEBML2/libMatroska2. A small deterministic
 * C ABI exposes machine-readable structural evidence to Emscripten.
 *
 * Derived traversal pattern from upstream libmatroska2/test/mkvtree.c
 * (Copyright 2008-2010 Matroska, non-profit organisation; BSD-3-Clause).
 * No MKVToolNix GPL implementation is included.
 *
 * No writing, UID edit, or production safety decision is authorized here.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>
#include "matroska2/matroska.h"
#include <corec/helpers/file/streams.h>
#include <corec/helpers/parser/parser.h>
#include <corec/str/str.h>

#define JSON_CAP (1024 * 1024)
#define NODE_LIMIT 8192
#define DEPTH_LIMIT 32
static char output[JSON_CAP];
static size_t used = 0;
static unsigned count = 0;
static int parse_failed = 0;

void DebugMessage(const tchar_t *msg, ...) { (void)msg; }

static void append(const char *value) {
  size_t size = strlen(value);
  if (parse_failed || used > JSON_CAP-1 || size > JSON_CAP-1-used) {
    parse_failed = 1;
    return;
  }
  memcpy(output+used,value,size);
  used+=size;
  output[used]=0;
}
static void json_string(const char *s) {
  append("\"");
  for (; !parse_failed && s && *s; s++) {
    char temp[8];
    unsigned char c = (unsigned char)*s;
    if (c == '\"' || c == '\\') {
      temp[0]='\\';temp[1]=(char)c;temp[2]=0;
      append(temp);
    } else if (c < 0x20) {
      snprintf(temp,sizeof(temp),"\\u%04x",(unsigned)c);
      append(temp);
    } else {
      temp[0]=(char)c;temp[1]=0;
      append(temp);
    }
  }
  append("\"");
}
static void emit(ebml_element *e,int depth) {
  char part[192];
  const filepos_t pos = EBML_ElementPosition(e);
  const filepos_t data = EBML_ElementDataSize(e,1);
  const int master = Node_IsPartOf(e,EBML_MASTER_CLASS);
  if (parse_failed || ++count > NODE_LIMIT || depth > DEPTH_LIMIT) {
    parse_failed=1;
    return;
  }
  if(count>1)append(",");
  snprintf(part,sizeof(part),
    "{\"depth\":%d,\"id\":\"0x%08x\",\"name\":",
    depth,(unsigned)EBML_ElementClassID(e));
  append(part);
  json_string(EBML_ElementGetClassName(e));
  snprintf(part,sizeof(part),
    ",\"offset\":\"%lld\",\"dataBytes\":\"%lld\",\"master\":%s}",
    (long long)pos,(long long)data,master?"true":"false");
  append(part);
}

/* Returns an element that the caller must continue handling at a higher
 * nesting level, mirroring libmatroska2's own mkvtree sample traversal. */
static ebml_element *visit(ebml_element *element,
  const ebml_parser_context *context,struct stream *input,int *level) {
  if (parse_failed)return NULL;
  emit(element,*level);
  if (parse_failed)return NULL;
  if (Node_IsPartOf(element,EBML_MASTER_CLASS)) {
    int upper=0;
    ebml_element *child,*next;
    ebml_parser_context sub;
    sub.UpContext=context;
    sub.Context=EBML_ElementContext(element);
    sub.EndPosition=EBML_ElementPositionEnd(element);
    sub.Profile=context?context->Profile:PROFILE_MATROSKA_ANY;
    child=EBML_FindNextElement(input,&sub,&upper,1);
    while(child!=NULL && upper<=0 &&
      (!EBML_ElementIsFiniteSize(element) ||
        EBML_ElementPosition(child)<=EBML_ElementPositionEnd(element)) &&
      !parse_failed) {
      ++*level;
      next=visit(child,&sub,input,level);
      NodeDelete((node*)child);
      child=next?next:EBML_FindNextElement(input,&sub,&upper,1);
      --*level;
      if (upper<0)*level+=upper;
      else if (upper!=0 && *level>0)*level-=upper-1;
    }
    return child;
  }
  // Native parser handles the binary/unknown element boundaries.
  EBML_ElementSkipData(element,input,context,NULL,0);
  return NULL;
}

/* Emscripten stable C ABI for a prototype read-only machine-readable tree.
 * Return 0 on success; caller must reject all nonzero codes. */
int foundation_probe(const char *path) {
  parsercontext ctx;
  struct stream *input=NULL;
  ebml_element *root=NULL;
  tchar_t name[MAXPATHFULL];
  int depth=-1,rc=0;
  used=0;count=0;parse_failed=0;output[0]=0;
  append("{\"schema\":\"foundation-matroska-structured-tree-v0\",\"nodes\":[");
  if(!path||!path[0]||strlen(path)>=1024)return 11;
  ParserContext_Init(&ctx,NULL,NULL,NULL);
  if(MATROSKA_Init(&ctx)!=ERR_NONE){rc=12;goto cleanup;}
  Node_FromStr(&ctx,name,TSIZEOF(name),path);
  input=StreamOpen(&ctx,name,SFLAG_RDONLY);
  if(!input){rc=13;goto cleanup;}
  root=EBML_ElementCreate(input,MATROSKA_getContextStream(),0,PROFILE_MATROSKA_ANY);
  if(!root){rc=14;goto cleanup;}
  EBML_ElementSetInfiniteSize(root,1);
  visit(root,NULL,input,&depth);
  if(parse_failed || count<3){rc=15;goto cleanup;}
  append("],\"nodeCount\":");
  char num[32];snprintf(num,sizeof(num),"%u",count);append(num);
  append("}");
  if(parse_failed)rc=16;
cleanup:
  if(root)NodeDelete((node*)root);
  if(input)StreamClose(input);
  ParserContext_Done(&ctx);
  if(rc){used=0;output[0]=0;} // No partial success JSON.
  return rc;
}
const char *foundation_json(void) { return output; }
int main(void){return 0;}
