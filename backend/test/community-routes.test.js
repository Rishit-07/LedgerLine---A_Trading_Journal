import test from 'node:test';
import assert from 'node:assert/strict';
import {communityRedirect,roomPath} from '../../frontend/src/features/community/routes.js';

test('legacy links retain the community type and ID, and canonical links are stable',()=>{
  const id='aabbccdd-1234-4456-8999-010203040506';
  for(const [input,expected] of [
    ['/community','/clubs'],['/community?tab=spaces','/spaces'],
    ['/community/clubs/'+id,'/clubs/'+id],['/mentor-spaces/'+id,'/spaces/'+id],
    ['/community?spaceId='+id,'/spaces/'+id],['/clubs?id='+id,'/clubs/'+id],
    ['/community?id='+id,'/community/'+id],['/spaces/'+id,null],['/clubs/'+id,null],
  ])assert.equal(communityRedirect(new URL(input,'https://example.org')),expected);
  assert.ok(roomPath('/spaces/'+id));assert.equal(roomPath('//example.org/'+id),false);
});
