import {selectReleaseScope} from './release-scope.mjs';
import {assertProductionReady} from './seo.mjs';
import {contactSettings} from './contact.mjs';

/** One gate for static build, static check and the existing enquiry starter.
 * Selection never manufactures approvals and retains the original page objects.
 */
export function prepareRelease(config,allPages,registry,{root}={}) {
 const release=selectReleaseScope(config,allPages,registry,{root});
 if(config.mode==='production') {
  assertProductionReady(config,release.pages);
  const contact=contactSettings(config);
  if(!contact.active)throw new Error('RELEASE_CONTACT: Der bestätigte öffentliche Kontaktweg ist nicht aktiviert.');
  if(contact.email!=='info@exobasis.com')throw new Error('RELEASE_CONTACT: Die öffentliche Kontaktadresse muss info@exobasis.com sein.');
 }
 return release;
}
