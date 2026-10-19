import type { ProductContent } from "./product";

export type Lesson = ProductContent["sections"][number];
export type LessonGroup = { category: string; lessons: Lesson[] };

/** Older products did not store lesson identities. Preserve all existing IDs. */
export function withLessonIds(sections: Lesson[]): Lesson[] {
  return sections.map(section => section.id ? section : {...section, id: crypto.randomUUID()});
}

export function lessonGroups(sections: Lesson[]): LessonGroup[] {
  const groups: LessonGroup[] = [];
  for (const lesson of sections) {
    const category = lesson.category || "";
    let group = groups.find(item => item.category === category);
    if (!group) {
      group = {category, lessons: []};
      groups.push(group);
    }
    group.lessons.push(lesson);
  }
  return groups;
}

export function moveLesson(sections: Lesson[], id: string, direction: -1 | 1): Lesson[] {
  const index = sections.findIndex(section => section.id === id);
  if (index < 0) return sections;
  const peers = sections.map((lesson, position) => ({lesson, position})).filter(item => (item.lesson.category || "") === (sections[index].category || ""));
  const peerIndex = peers.findIndex(item => item.position === index);
  const target = peers[peerIndex + direction];
  if (!target) return sections;
  const next = [...sections];
  [next[index], next[target.position]] = [next[target.position], next[index]];
  return next;
}

export function moveLessonGroup(sections: Lesson[], category: string, direction: -1 | 1): Lesson[] {
  const groups = lessonGroups(sections);
  const index = groups.findIndex(group => group.category === category);
  if (index < 0 || !groups[index + direction]) return sections;
  [groups[index], groups[index + direction]] = [groups[index + direction], groups[index]];
  return groups.flatMap(group => group.lessons);
}

/** An upload finishes against its original lesson, regardless of current selection. */
export function attachLessonVideo(sections: Lesson[], lessonId: string, videoId: string): Lesson[] {
  return sections.map(section => section.id === lessonId ? {...section, videoId} : section);
}
