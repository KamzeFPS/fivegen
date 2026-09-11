import {database} from './server';
export const TERMS_VERSION='2026-09-11-credits';
export async function acceptedTerms(owner:string){return !!await database().prepare('SELECT id FROM terms_acceptances WHERE owner=? AND version=?').bind(owner,TERMS_VERSION).first();}
