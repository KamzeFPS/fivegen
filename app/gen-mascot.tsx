import './gen-mascot.css';

export type GenMood='idle'|'thinking'|'curious'|'helping'|'happy'|'concerned';
export type GenMascotProps={mood:GenMood;size?:number;className?:string};

/** Gen is decorative; the assistant button or message supplies its own label. */
export function GenMascot({mood,size=90,className=''}:GenMascotProps){
 const happy=mood==='happy',thinking=mood==='thinking',concerned=mood==='concerned',curious=mood==='curious';
 return <span className={`gen-mascot gen-mascot--${mood}${className?` ${className}`:''}`} style={{width:size,height:size}} data-mood={mood} aria-hidden="true">
  <svg viewBox="0 0 240 280" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
   <ellipse className="gen-mascot__shadow" cx="120" cy="258" rx="52" ry="8" fill="#141414" opacity=".18"/>
   {happy&&<g className="gen-mascot__celebration" data-expression="celebration">
    <path className="gen-mascot__spark gen-mascot__spark--one" d="M34 77V88M28.5 82.5H39.5" stroke="#FFD3B0" strokeWidth="3.5" strokeLinecap="round"/>
    <path className="gen-mascot__spark gen-mascot__spark--two" d="M206 65V76M200.5 70.5H211.5" stroke="#FF9A4D" strokeWidth="3.5" strokeLinecap="round"/>
    <path className="gen-mascot__confetti gen-mascot__confetti--one" d="M46 47L42 53" stroke="#FFD3B0" strokeWidth="5" strokeLinecap="round"/>
    <path className="gen-mascot__confetti gen-mascot__confetti--two" d="M219 108L224 113" stroke="#FF6B00" strokeWidth="5" strokeLinecap="round"/>
    <circle className="gen-mascot__confetti gen-mascot__confetti--three" cx="22" cy="151" r="3" fill="#FF9A4D"/>
   </g>}
   <g className="gen-mascot__character">
    <g className="gen-mascot__feet" fill="#141414">
     <rect x="74" y="220" width="33" height="20" rx="10"/>
     <rect x="132" y="220" width="33" height="20" rx="10"/>
    </g>
    <g className="gen-mascot__antenna">
     <path d="M120 83C117 58 128 45 150 36" stroke="#141414" strokeWidth="4.5" strokeLinecap="round"/>
     <g className="gen-mascot__tag">
      <path d="M139 29L152 21L181 30L175 51L146 42L139 29Z" fill="#FFD3B0" stroke="#141414" strokeWidth="3" strokeLinejoin="round"/>
      <circle cx="150" cy="31" r="2.7" fill="#141414"/>
      <text x="157" y="41" transform="rotate(17 164 36)" fill="#141414" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="18">$</text>
     </g>
    </g>
    <path className="gen-mascot__arm gen-mascot__arm--left" d={happy?'M51 161C32 151 27 135 29 121':'M51 161C33 170 29 183 29 197'} stroke="#141414" strokeWidth="10" strokeLinecap="round"/>
    <path className="gen-mascot__arm gen-mascot__arm--right" d={happy?'M189 159C206 150 214 134 212 118':'M189 162C207 151 213 137 212 126'} stroke="#141414" strokeWidth="10" strokeLinecap="round"/>
    <g className="gen-mascot__body">
     <rect x="45" y="80" width="150" height="150" rx="46" fill="#FF6B00"/>
     <path d="M62 125C65 104 77 94 90 91" stroke="#FF9A4D" strokeWidth="6" strokeLinecap="round"/>
     <rect x="62" y="107" width="116" height="71" rx="29" fill="#141414"/>
     <g className="gen-mascot__face" data-expression={thinking?'thinking-dots':happy?'joy':concerned?'concerned':curious?'curious':'smile'}>
      {thinking?<g className="gen-mascot__thought-dots" fill="#FFFFFF">
       <circle className="gen-mascot__thought-dot" cx="100" cy="142" r="4"/>
       <circle className="gen-mascot__thought-dot" cx="120" cy="142" r="4"/>
       <circle className="gen-mascot__thought-dot" cx="140" cy="142" r="4"/>
      </g>:happy?<>
       <g className="gen-mascot__joy-eyes" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round">
        <path d="M91 138Q98 127 105 138"/>
        <path d="M135 138Q142 127 149 138"/>
       </g>
       <path d="M110 155Q120 165 130 155" stroke="#FF6B00" strokeWidth="4.2" strokeLinecap="round"/>
      </>:<>
       {concerned&&<g stroke="#FFFFFF" strokeWidth="2.7" strokeLinecap="round" opacity=".9"><path d="M91 124L103 120"/><path d="M137 120L149 124"/></g>}
       {curious&&<path d="M135 122Q142 117 149 122" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity=".9"/>}
       <g className="gen-mascot__eyes" fill="#FFFFFF">
        <ellipse cx="100" cy={concerned?'141':'138'} rx={curious?'6':'6.7'} ry={curious?'9':'10.5'}/>
        <ellipse cx="140" cy={curious?'135':concerned?'141':'138'} rx="6.7" ry={curious?'11.5':'10.5'}/>
       </g>
       <path d={concerned?'M111 161Q120 154 129 161':'M111 158Q120 166 129 158'} stroke="#FF6B00" strokeWidth="4" strokeLinecap="round"/>
      </>}
     </g>
     <circle cx="72.5" cy="197.5" r="8.5" fill="#FF9A4D"/>
     <circle cx="167.5" cy="197.5" r="8.5" fill="#FF9A4D"/>
    </g>
   </g>
  </svg>
 </span>;
}
