/**
 * Tests for sorting utilities
 */

import { describe, it, expect } from 'bun:test';
import { stripLeadingArticles } from '../../server/sort-utils';
import { orderBy } from 'natural-orderby';

describe('stripLeadingArticles', () => {
  describe('article stripping', () => {
    it('should strip "the" from the start of a filename', () => {
      expect(stripLeadingArticles('The Matrix.mp4')).toBe('Matrix.mp4');
      expect(stripLeadingArticles('the office s01e01.mkv')).toBe(
        'office s01e01.mkv',
      );
      expect(stripLeadingArticles('THE DARK KNIGHT.avi')).toBe(
        'DARK KNIGHT.avi',
      );
    });

    it('should strip "a" from the start of a filename', () => {
      expect(stripLeadingArticles('A Beautiful Mind.mp4')).toBe(
        'Beautiful Mind.mp4',
      );
      expect(stripLeadingArticles('a file.txt')).toBe('file.txt');
      expect(stripLeadingArticles('A MOVIE.mkv')).toBe('MOVIE.mkv');
    });

    it('should strip "and" from the start of a filename', () => {
      expect(stripLeadingArticles('And Then There Were None.mp4')).toBe(
        'Then There Were None.mp4',
      );
      expect(stripLeadingArticles('and more files.txt')).toBe('more files.txt');
      expect(stripLeadingArticles('AND ANOTHER ONE.avi')).toBe(
        'ANOTHER ONE.avi',
      );
    });

    it('should not strip articles that are not at the start', () => {
      expect(stripLeadingArticles('Watch The Throne.mp4')).toBe(
        'Watch The Throne.mp4',
      );
      expect(stripLeadingArticles('Such a File.txt')).toBe('Such a File.txt');
      expect(stripLeadingArticles('Rock and Roll.mp3')).toBe(
        'Rock and Roll.mp3',
      );
    });

    it('should not strip partial word matches', () => {
      // "theater" starts with "the" but is not the article "the"
      expect(stripLeadingArticles('theater.mp4')).toBe('theater.mp4');
      expect(stripLeadingArticles('Theater of Dreams.mkv')).toBe(
        'Theater of Dreams.mkv',
      );

      // "android" starts with "and" but is not the article "and"
      expect(stripLeadingArticles('android.apk')).toBe('android.apk');
      expect(stripLeadingArticles('Android App.zip')).toBe('Android App.zip');

      // Words starting with "a" but not the article "a"
      expect(stripLeadingArticles('another file.txt')).toBe('another file.txt');
      expect(stripLeadingArticles('Another Day.mp4')).toBe('Another Day.mp4');
    });

    it('should handle filenames without articles', () => {
      expect(stripLeadingArticles('Matrix.mp4')).toBe('Matrix.mp4');
      expect(stripLeadingArticles('Office.txt')).toBe('Office.txt');
      expect(stripLeadingArticles('File.doc')).toBe('File.doc');
    });

    it('should handle empty strings', () => {
      expect(stripLeadingArticles('')).toBe('');
    });

    it('should handle single character strings', () => {
      expect(stripLeadingArticles('a')).toBe('a');
      expect(stripLeadingArticles('A')).toBe('A');
      expect(stripLeadingArticles('x')).toBe('x');
    });
  });

  describe('sorting integration', () => {
    it('should sort files ignoring leading "the"', () => {
      const files = [
        'The Zebra.mp4',
        'Apple.mp4',
        'The Apple.mp4',
        'Banana.mp4',
        'The Banana.mp4',
      ];

      const sorted = orderBy(
        files,
        [(file) => stripLeadingArticles(file)],
        ['asc'],
      );

      expect(sorted).toEqual([
        'Apple.mp4',
        'The Apple.mp4',
        'Banana.mp4',
        'The Banana.mp4',
        'The Zebra.mp4',
      ]);
    });

    it('should sort files ignoring leading "a"', () => {
      const files = [
        'Zebra.mp4',
        'A Zebra.mp4',
        'A Beautiful Mind.mp4',
        'Beautiful Day.mp4',
      ];

      const sorted = orderBy(
        files,
        [(file) => stripLeadingArticles(file)],
        ['asc'],
      );

      // After stripping: "Beautiful Mind.mp4", "Beautiful Day.mp4", "Zebra.mp4", "Zebra.mp4"
      // Sorted: "Beautiful Day.mp4" < "Beautiful Mind.mp4" < "Zebra.mp4"
      expect(sorted).toEqual([
        'Beautiful Day.mp4',
        'A Beautiful Mind.mp4',
        'Zebra.mp4',
        'A Zebra.mp4',
      ]);
    });

    it('should sort files ignoring leading "and"', () => {
      const files = [
        'Zebra Files.mp4',
        'And Then There Were None.mp4',
        'And More Files.txt',
        'More Files.txt',
      ];

      const sorted = orderBy(
        files,
        [(file) => stripLeadingArticles(file)],
        ['asc'],
      );

      expect(sorted).toEqual([
        'And More Files.txt',
        'More Files.txt',
        'And Then There Were None.mp4',
        'Zebra Files.mp4',
      ]);
    });

    it('should maintain natural sort order with numbers', () => {
      const files = [
        'The Office S10E01.mkv',
        'The Office S2E01.mkv',
        'The Office S1E01.mkv',
        'The Office S9E01.mkv',
      ];

      const sorted = orderBy(
        files,
        [(file) => stripLeadingArticles(file)],
        ['asc'],
      );

      // Natural sort should put S2 before S10
      expect(sorted).toEqual([
        'The Office S1E01.mkv',
        'The Office S2E01.mkv',
        'The Office S9E01.mkv',
        'The Office S10E01.mkv',
      ]);
    });

    it('should handle mixed case consistently', () => {
      const files = [
        'The Matrix.mp4',
        'the office.mkv',
        'THE DARK KNIGHT.avi',
        'A Beautiful Mind.mp4',
        'a file.txt',
        'Matrix Reloaded.mp4',
      ];

      const sorted = orderBy(
        files,
        [(file) => stripLeadingArticles(file)],
        ['asc'],
      );

      // After stripping articles:
      // "Matrix.mp4", "office.mkv", "DARK KNIGHT.avi", "Beautiful Mind.mp4", "file.txt", "Matrix Reloaded.mp4"
      // Natural sort is case-insensitive: Beautiful < DARK < file < Matrix < Matrix Reloaded < office
      expect(sorted).toEqual([
        'A Beautiful Mind.mp4',
        'THE DARK KNIGHT.avi',
        'a file.txt',
        'Matrix Reloaded.mp4',
        'The Matrix.mp4',
        'the office.mkv',
      ]);
    });

    it('should sort directories and files with articles correctly', () => {
      const items = [
        { name: 'The Office', isDirectory: true },
        { name: 'A Folder', isDirectory: true },
        { name: 'The Matrix.mp4', isDirectory: false },
        { name: 'Office Space.mp4', isDirectory: false },
        { name: 'Matrix.txt', isDirectory: false },
      ];

      // Separate directories and files, then sort each group
      const directories = items.filter((item) => item.isDirectory);
      const files = items.filter((item) => !item.isDirectory);

      const sortedDirs = orderBy(
        directories,
        [(item) => stripLeadingArticles(item.name)],
        ['asc'],
      );
      const sortedFiles = orderBy(
        files,
        [(item) => stripLeadingArticles(item.name)],
        ['asc'],
      );

      expect(sortedDirs.map((d) => d.name)).toEqual(['A Folder', 'The Office']);
      expect(sortedFiles.map((f) => f.name)).toEqual([
        'The Matrix.mp4',
        'Matrix.txt',
        'Office Space.mp4',
      ]);
    });
  });
});
