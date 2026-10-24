import type {ReactNode} from 'react';

/** Settings and long passages may scroll; the send action must stay reachable. */
export function BuilderAgentComposerFrame({children,footer}:{children:ReactNode;footer:ReactNode}){
 return <><div className="builder-agent-form-body">{children}</div>{footer}</>;
}
