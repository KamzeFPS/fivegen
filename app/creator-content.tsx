"use client";

import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {ArrowDown, ArrowUp, Film, FolderPlus, Loader2, Pencil, Plus, Trash2, Upload, X} from "lucide-react";
import {toast} from "sonner";
import type {Product} from "@/lib/product";
import {uploadLimit} from "@/lib/experience";
import {attachLessonVideo, lessonGroups, moveLesson, moveLessonGroup, withLessonIds, type Lesson} from "@/lib/curriculum";

type Recording = {purpose?: string; id: string; name: string; mime: string; size: number};
type UploadState = {lessonId: string; lessonTitle: string; name: string; progress: number};

type CreatorContentProps = {
  product: Product;
  onChange: (product: Product) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function CreatorContent(props: CreatorContentProps) {
  return <CreatorContentEditor key={props.product.id} {...props}/>;
}

function CreatorContentEditor({product, onChange, disabled = false, onBusyChange}: CreatorContentProps) {
  const [initialSections] = useState(() => withLessonIds(product.content.sections));
  const [selectedId, setSelectedId] = useState(initialSections[0]?.id || "");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{category: string; value: string} | null>(null);
  const productRef = useRef(product), onChangeRef = useRef(onChange), busyCallback = useRef(onBusyChange);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  useLayoutEffect(() => {
    productRef.current = product;
    onChangeRef.current = onChange;
    busyCallback.current = onBusyChange;
  }, [product, onChange, onBusyChange]);

  useEffect(() => {
    const current = productRef.current;
    if (current.content.sections.some(section => !section.id)) {
      const next = {...current, content: {...current.content, sections: initialSections}};
      productRef.current = next;
      onChangeRef.current(next);
    }
    return () => {
      xhrRef.current?.abort();
      xhrRef.current = null;
      busyCallback.current?.(false);
    };
  }, [initialSections]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/products/${product.id}/uploads`, {signal: controller.signal})
      .then(async response => {
        const data = await response.json() as {uploads?: Recording[]; error?: string};
        if (!response.ok) throw new Error(data.error || "Could not load your recordings.");
        if (!controller.signal.aborted) setRecordings((data.uploads || []).filter(file => file.mime.startsWith("video/") && file.purpose !== "voice"));
      })
      .catch(reason => {if (!controller.signal.aborted) setLibraryError((reason as Error).message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [product.id, libraryVersion]);

  useEffect(() => {
    busyCallback.current?.(!!upload || !!deletingId);
  }, [upload, deletingId]);

  const sections = product.content.sections;
  const groups = lessonGroups(sections);
  const selected = sections.find(section => section.id === selectedId) || sections[0];
  const locked = disabled || !!deletingId;
  const selectedRecording = recordings.find(recording => recording.id === selected?.videoId);

  function setSections(nextSections: Lesson[], activeId?: string) {
    const current = productRef.current;
    const next = {...current, content: {...current.content, sections: withLessonIds(nextSections)}};
    productRef.current = next;
    onChangeRef.current(next);
    if (activeId) setSelectedId(activeId);
  }

  function editLesson(id: string | undefined, changes: Partial<Lesson>) {
    setSections(productRef.current.content.sections.map(section => section.id === id ? {...section, ...changes} : section));
  }

  function addLesson(category?: string) {
    if (productRef.current.content.sections.length >= 30) return;
    const lesson = {id: crypto.randomUUID(), title: "Untitled lesson", body: "", ...(category ? {category} : {})};
    setSections([...productRef.current.content.sections, lesson], lesson.id);
  }

  function addModule() {
    const category = newCategory.trim();
    if (!category) return;
    if (groups.some(group => group.category === category)) {
      setError("A module with this name already exists. Choose a different name.");
      return;
    }
    setError("");
    addLesson(category);
    setNewCategory("");
  }

  function renameModule() {
    if (!renaming) return;
    const category = renaming.value.trim();
    if (!category) return;
    if (groups.some(group => group.category === category && group.category !== renaming.category)) {
      setError("A module with this name already exists. Move lessons using their Module field to combine them.");
      return;
    }
    setSections(productRef.current.content.sections.map(section => (section.category || "") === renaming.category ? {...section, category} : section));
    setError("");
    setRenaming(null);
  }

  function uploadRecording(file: File, lesson: Lesson) {
    setError("");
    const mime = file.type || (/\.mp4$/i.test(file.name) ? "video/mp4" : /\.webm$/i.test(file.name) ? "video/webm" : "");
    if (!["video/mp4", "video/webm"].includes(mime)) {
      setError("Choose an MP4 or WebM recording.");
      return;
    }
    if (file.size < 1 || file.size > uploadLimit) {
      setError("Recordings must be between 1 byte and 100 MB. Split longer videos into separate lessons.");
      return;
    }
    if (!lesson.id) return;
    const lessonId = lesson.id, productId = product.id;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setUpload({lessonId, lessonTitle: lesson.title, name: file.name, progress: 0});
    xhr.open("POST", `/api/products/${productId}/uploads?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("X-File-Size", String(file.size));
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) setUpload(current => current && {...current, progress: Math.round(event.loaded / event.total * 100)});
    };
    const finish = () => {xhrRef.current = null; setUpload(null);};
    xhr.onload = () => {
      finish();
      if (productRef.current.id !== productId) return;
      try {
        const data = JSON.parse(xhr.responseText) as {upload?: Recording; error?: string};
        if (xhr.status < 200 || xhr.status >= 300 || !data.upload) throw new Error(data.error || "Your upload could not be completed. Please try again.");
        const recording = data.upload;
        setRecordings(current => [recording, ...current.filter(item => item.id !== recording.id)]);
        const current = productRef.current;
        if (current.content.sections.some(section => section.id === lessonId)) {
          setSections(attachLessonVideo(current.content.sections, lessonId, recording.id));
          toast.success("Recording attached. Save your product to keep the lesson changes.");
        } else {
          toast.success("Recording uploaded to your library. Choose a lesson to attach it.");
        }
      } catch (reason) {setError((reason as Error).message);}
    };
    xhr.onerror = () => {finish(); setError("The upload was interrupted. Please retry your recording.");};
    xhr.onabort = finish;
    xhr.send(file);
  }

  async function deleteRecording(recording: Recording) {
    if (sections.some(section => section.videoId === recording.id)) {
      setError("Remove this recording from its lessons and save your product before deleting it from the library.");
      return;
    }
    setDeletingId(recording.id);
    setError("");
    try {
      const response = await fetch(`/api/uploads/${recording.id}`, {method: "DELETE"});
      const data = await response.json() as {error?: string};
      if (!response.ok) throw new Error(data.error || "This recording could not be deleted.");
      setRecordings(current => current.filter(item => item.id !== recording.id));
      toast.success("Recording deleted from your library.");
    } catch (reason) {setError((reason as Error).message);}
    finally {setDeletingId("");}
  }

  return <div className="growth-content">
    <div className="growth-toolbar">
      <div><h2>Your expertise. Your lessons.</h2><p className="growth-muted">Record and write the product in your own voice. Organize it into modules while FiveGen helps with the marketing.</p></div>
      <span className="growth-muted">{sections.length} / 30 lessons</span>
    </div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {upload && <div className="growth-upload-status" role="status" aria-live="polite">
      <Loader2 className="spin" size={18}/><div><strong>{upload.progress === 100 ? "Finishing upload" : `Uploading ${upload.progress}%`} · {upload.name}</strong><p>Attaching to “{upload.lessonTitle}”. You can keep editing lessons while it uploads.</p><progress max={100} value={upload.progress} aria-label={`Upload progress for ${upload.name}`}/></div>
      <button type="button" className="button secondary" onClick={() => xhrRef.current?.abort()}>Cancel upload</button>
    </div>}
    <div className="growth-content-grid">
      <aside className="growth-modules" aria-label="Product modules and lessons">
        <div className="growth-toolbar"><h3>Modules & lessons</h3><button type="button" className="icon-button" aria-label="Add an ungrouped lesson" disabled={locked || sections.length >= 30} onClick={() => addLesson()}><Plus size={17}/></button></div>
        {groups.map((group, groupIndex) => <section className="growth-module" key={group.category || "ungrouped"}>
          <div className="growth-module-heading">
            {renaming?.category === group.category ? <div className="growth-inline-form"><input aria-label="Module name" autoFocus maxLength={80} value={renaming.value} disabled={locked} onChange={event => setRenaming({...renaming, value: event.target.value})} onKeyDown={event => {if (event.key === "Enter") renameModule(); if (event.key === "Escape") setRenaming(null);}}/><button type="button" className="button secondary" disabled={locked || !renaming.value.trim()} onClick={renameModule}>Apply</button><button type="button" className="icon-button" aria-label="Cancel module rename" onClick={() => setRenaming(null)}><X size={15}/></button></div> : <>
              <strong>{group.category || "Ungrouped lessons"}</strong>
              <div className="growth-row-actions"><button type="button" className="icon-button" aria-label={`Rename ${group.category || "Ungrouped lessons"}`} disabled={locked} onClick={() => setRenaming({category: group.category, value: group.category})}><Pencil size={14}/></button><button type="button" className="icon-button" aria-label={`Move ${group.category || "Ungrouped lessons"} up`} disabled={locked || groupIndex === 0} onClick={() => setSections(moveLessonGroup(sections, group.category, -1))}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={`Move ${group.category || "Ungrouped lessons"} down`} disabled={locked || groupIndex === groups.length - 1} onClick={() => setSections(moveLessonGroup(sections, group.category, 1))}><ArrowDown size={14}/></button></div>
            </>}
          </div>
          <div className="growth-lesson-list">{group.lessons.map((lesson, lessonIndex) => <div className={`growth-lesson-row ${selected === lesson ? "is-active" : ""}`} key={lesson.id || `${group.category}-${lessonIndex}`}>
            <button type="button" className="growth-lesson-select" aria-pressed={selected === lesson} onClick={() => setSelectedId(lesson.id || "")}><span>{String(lessonIndex + 1).padStart(2, "0")}</span><span>{lesson.title || "Untitled lesson"}</span>{lesson.videoId && <Film size={14} aria-label="Has a recording"/>}</button>
            <div className="growth-row-actions"><button type="button" className="icon-button" aria-label={`Move ${lesson.title} up`} disabled={locked || lessonIndex === 0} onClick={() => setSections(moveLesson(sections, lesson.id!, -1))}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={`Move ${lesson.title} down`} disabled={locked || lessonIndex === group.lessons.length - 1} onClick={() => setSections(moveLesson(sections, lesson.id!, 1))}><ArrowDown size={14}/></button></div>
          </div>)}</div>
          <button type="button" className="button secondary" disabled={locked || sections.length >= 30} onClick={() => addLesson(group.category)}><Plus size={15}/>Add lesson</button>
        </section>)}
        <div className="growth-module-composer"><label>New module<input maxLength={80} value={newCategory} disabled={locked || sections.length >= 30} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => {if (event.key === "Enter") addModule();}} placeholder="e.g. Build your foundation"/></label><button type="button" className="button secondary" disabled={locked || sections.length >= 30 || !newCategory.trim()} onClick={addModule}><FolderPlus size={16}/>Add module</button><p className="growth-muted">A new module starts with one lesson. Empty modules disappear when their lessons are moved or removed.</p></div>
      </aside>
      {selected && <section className="growth-lesson-editor">
        <div className="growth-toolbar"><h3>Edit lesson</h3><button type="button" className="button secondary" disabled={locked || sections.length <= 1 || upload?.lessonId === selected.id} onClick={() => {
          const next = sections.filter(section => section.id !== selected.id);
          setSections(next, next[0]?.id);
        }}><Trash2 size={15}/>Remove lesson</button></div>
        <fieldset disabled={locked} className="form-stack">
          <label>Lesson title<input value={selected.title} maxLength={150} onChange={event => editLesson(selected.id, {title: event.target.value})} placeholder="What will you teach?"/></label>
          <label>Module<select value={selected.category || ""} onChange={event => editLesson(selected.id, {category: event.target.value || undefined})}><option value="">Ungrouped lessons</option>{groups.filter(group => group.category).map(group => <option key={group.category} value={group.category}>{group.category}</option>)}</select></label>
          <label>Your lesson notes<textarea rows={12} maxLength={18000} value={selected.body} onChange={event => editLesson(selected.id, {body: event.target.value})} placeholder="Write your lesson, share a personal example, or add the exercises that support your recording. Markdown is supported."/></label>
          <div className="growth-recording"><div className="growth-toolbar"><div><h3>Lesson recording</h3><p className="growth-muted">MP4 or WebM · up to 100 MB per file · 2 GB per workspace.</p></div></div>
            {selected.videoId ? <div className="growth-video-preview"><video key={selected.videoId} controls preload="metadata" src={`/api/uploads/${selected.videoId}`} aria-label={`Recording for ${selected.title}`} style={{width: "100%", maxHeight: 380, borderRadius: 12}}/><div className="growth-toolbar"><span className="growth-muted">{selectedRecording?.name || "Attached recording"}</span><button type="button" className="button secondary" onClick={() => editLesson(selected.id, {videoId: undefined})}><X size={15}/>Detach recording</button></div></div> : <div className="growth-empty"><Film size={28}/><p>Add a recording of you teaching this lesson, or keep it as a written resource.</p></div>}
            <label className={`button secondary ${upload ? "is-uploading" : ""}`}><Upload size={16}/>{upload ? "Upload in progress" : selected.videoId ? "Upload a replacement" : "Upload your recording"}<input type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={locked || !!upload} onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadRecording(file, selected);}} style={{position: "absolute", width: 1, height: 1, opacity: 0}}/></label>
            <label>Or choose an uploaded recording<select disabled={loading || locked} value={selected.videoId || ""} onChange={event => editLesson(selected.id, {videoId: event.target.value || undefined})}><option value="">No recording</option>{selected.videoId && !selectedRecording && <option value={selected.videoId}>Attached recording</option>}{recordings.map(recording => <option key={recording.id} value={recording.id}>{recording.name}</option>)}</select></label>
          </div>
        </fieldset>
        <p className="growth-muted">Lesson changes and recording attachments are saved with your product. Your recordings stay private.</p>
      </section>}
    </div>
    <section className="growth-recording-library"><div className="growth-toolbar"><div><h3>Your recording library</h3><p className="growth-muted">Recordings uploaded to this product. Detach a recording and save before deleting it.</p></div></div>
      {loading ? <p className="growth-muted" role="status">Loading recordings…</p> : libraryError ? <div className="error-banner" role="alert">{libraryError} <button type="button" className="button secondary" onClick={() => {setLoading(true); setLibraryError(""); setLibraryVersion(value => value + 1);}}>Retry library</button></div> : recordings.length ? <div className="resource-list">{recordings.map(recording => <div key={recording.id}><a href={`/api/uploads/${recording.id}`} target="_blank" rel="noreferrer">{recording.name}</a><small>{(recording.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" className="icon-button" disabled={locked || !!upload} aria-label={`Delete ${recording.name} from the library`} onClick={() => void deleteRecording(recording)}>{deletingId === recording.id ? <Loader2 size={16} className="spin"/> : <Trash2 size={16}/>}</button></div>)}</div> : <div className="growth-empty"><p>No recordings yet. Select a lesson above and upload your first video.</p></div>}
    </section>
  </div>;
}
