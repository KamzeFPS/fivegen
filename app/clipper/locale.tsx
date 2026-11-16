'use client';

import {useEffect} from 'react';

export function ClipperLocale({lang}:{lang:'mn'|'en'}){
  useEffect(()=>{
    const previous=document.documentElement.lang;
    document.documentElement.lang=lang;
    try{localStorage.setItem('fivegen-clipper-language',lang);}catch{}
    return()=>{document.documentElement.lang=previous;};
  },[lang]);
  return null;
}
