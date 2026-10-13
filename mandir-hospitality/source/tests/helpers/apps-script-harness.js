import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export const TEST_ADMIN_KEY = "test-admin-private-key";
export function createHarness(initialRows, denied = false) {
  const properties = new Map([["ADMIN_ACCESS_KEY", TEST_ADMIN_KEY]]);
  const writes=[], sheets=new Map();
  let locked=false;
  let today = "2026-10-10";
  class Sheet {
    constructor(name,rows=[],id=1){this.name=name;this.rows=rows;this.id=id;}
    getSheetId(){return this.id;}
    getLastRow(){return this.rows.length;}
    setFrozenRows(){return this;}
    setColumnWidths(){return this;}
    getDataRange(){return this.getRange(1,1,Math.max(1,this.rows.length),this.rows[0]?.length||1);}
    getRange(row,col,count,width){
      const sheet=this;
      return {
        getDisplayValues:()=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>String(sheet.rows[row+i-1]?.[col+j-1]??''))),
        setNumberFormat(){return this;},setBackground(){return this;},setFontColor(){return this;},setFontWeight(){return this;},
        setValues(values){
          if(sheet.id===0 && col===30){
            writes.push({range:`'Attendees'!AD${row}:AF${row}`,majorDimension:'ROWS',values:JSON.parse(JSON.stringify(values))});
            if(denied) throw new Error('The backend cannot edit this sheet.');
          }
          values.forEach((r,i)=>r.forEach((value,j)=>{if(!sheet.rows[row+i-1])sheet.rows[row+i-1]=[];sheet.rows[row+i-1][col+j-1]=typeof value==='string'&&value.startsWith("'")?value.slice(1):value;}));
          return this;
        },
      };
    }
  }
  sheets.set('Attendees',new Sheet('Attendees',structuredClone(initialRows),0));
  const book={getSheets:()=>[...sheets.values()],getSheetByName:name=>sheets.get(name),insertSheet:name=>{const s=new Sheet(name);sheets.set(name,s);return s;}};
  const context=vm.createContext({console,Date,JSON,Map,Set,URL,SpreadsheetApp:{openById:()=>book,flush:()=>{}},Utilities:{getUuid:randomUUID,formatDate:()=>today},LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock(){locked=false;}})},PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})}});
  vm.runInContext(readFileSync(new URL('../../apps-script/Code.gs',import.meta.url),'utf8'),context);
  const cache = new Map();
  context.CacheService = { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) };
  context.UrlFetchApp = { fetch: () => { throw Error('Unexpected network request in a test'); } };
  context.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) };
  return {sheets,writes,properties,rows:sheets.get('Attendees').rows,request:req=>JSON.parse(JSON.stringify(context.hospitalityRequest({accessKey:TEST_ADMIN_KEY,...req}))),setLocked:value=>{locked=value;},setToday:value=>{today=value;},setFetch:handler=>{context.UrlFetchApp.fetch=handler;},post:req=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(req)}}).text)};
}
