// SPDX-License-Identifier: AGPL-3.0-or-later

/** Index into the four course colours; stable per course and shared with the course cards. */
export const courseHue = (courseId: number): number => Math.abs(courseId) % 4
