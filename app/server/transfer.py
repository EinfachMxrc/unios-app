# SPDX-License-Identifier: AGPL-3.0-or-later
"""Authenticated chunk stream: bounded memory, ordering and complete-file checks."""

import io
import os
import struct
from collections.abc import Buffer
from hashlib import sha256
from typing import BinaryIO

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"UNIOS-MIGRATION-1\n"
CHUNK = 1024 * 1024


class EncryptedWriter(io.RawIOBase):
    def __init__(self, output: BinaryIO, key: bytes):
        super().__init__()
        self.output = output
        self.cipher = AESGCM(key)
        self.prefix = os.urandom(8)
        self.sequence = 0
        self.buffer = bytearray()
        self.digest = sha256()
        self.output.write(MAGIC + self.prefix)

    def _frame(self, value: bytes) -> None:
        sequence = struct.pack(">I", self.sequence)
        raw = self.cipher.encrypt(self.prefix + sequence, value, MAGIC + sequence)
        self.output.write(struct.pack(">I", len(raw)) + raw)
        self.sequence += 1

    def write(self, value: Buffer) -> int:
        value = bytes(value)
        self.digest.update(value)
        self.buffer.extend(value)
        while len(self.buffer) >= CHUNK:
            self._frame(b"D" + bytes(self.buffer[:CHUNK]))
            del self.buffer[:CHUNK]
        return len(value)

    def finish(self) -> None:
        if self.buffer:
            self._frame(b"D" + bytes(self.buffer))
            self.buffer.clear()
        self._frame(b"E" + self.digest.digest())
        self.output.flush()
        os.fsync(self.output.fileno())


class EncryptedReader(io.RawIOBase):
    def __init__(self, source: BinaryIO, key: bytes):
        if source.read(len(MAGIC)) != MAGIC:
            raise ValueError("Ungültiges Übernahmepaket")
        self.source = source
        self.prefix = source.read(8)
        self.cipher = AESGCM(key)
        self.sequence = 0
        self.buffer = bytearray()
        self.digest = sha256()
        self.finished = False

    def readable(self) -> bool:
        return True

    def readinto(self, target) -> int:
        if not self.buffer and not self.finished:
            header = self.source.read(4)
            if len(header) != 4:
                raise ValueError("Übernahmepaket wurde abgebrochen")
            size = struct.unpack(">I", header)[0]
            if not 17 <= size <= CHUNK + 17:
                raise ValueError("Ungültiger Übernahmeblock")
            raw = self.source.read(size)
            sequence = struct.pack(">I", self.sequence)
            value = self.cipher.decrypt(self.prefix + sequence, raw, MAGIC + sequence)
            self.sequence += 1
            if value[:1] == b"E":
                if value[1:] != self.digest.digest() or self.source.read(1):
                    raise ValueError("Übernahmepaket ist unvollständig")
                self.finished = True
            elif value[:1] == b"D":
                self.digest.update(value[1:])
                self.buffer.extend(value[1:])
            else:
                raise ValueError("Ungültiger Übernahmeblock")
        count = min(len(target), len(self.buffer))
        target[:count] = self.buffer[:count]
        del self.buffer[:count]
        return count

    def verify_end(self) -> None:
        while not self.finished:
            self.read(CHUNK)
