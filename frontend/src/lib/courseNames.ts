// SPDX-License-Identifier: AGPL-3.0-or-later
export function courseName(course: { name: string; display_name?: string | null }) {
  return course.display_name?.trim() || course.name
}
