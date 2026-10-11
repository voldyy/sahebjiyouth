import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driverFromUrl,driverUrl} from '../../src/lib/driverLinks.js';
test('driver links preserve Unicode and special characters and support both URL locations',()=>{
 const name='Sevak Patel & family / 2';const url=driverUrl('https://www.sahebjiyouth.org/mandir-hospitality/#transport',name);
 assert.equal(driverFromUrl(url),name);
 assert.equal(driverFromUrl('https://www.sahebjiyouth.org/mandir-hospitality/?driver=Mihir+Patel#transport'),'Mihir Patel');
 assert.equal(driverFromUrl(driverUrl(url,'All')),'All');
 assert.equal(driverFromUrl('https://example.org/#transport?driver=%E0%A4%9C%E0%A4%AF'),'जय');
});
