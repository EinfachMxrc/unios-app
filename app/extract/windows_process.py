# SPDX-License-Identifier: AGPL-3.0-or-later
"""Own a suspended Windows worker and its descendants before any code runs."""

import subprocess
from time import monotonic, sleep


class WindowsWorker:
    def __init__(self, command, environment):
        import pywintypes
        import win32api
        import win32con
        import win32event
        import win32file
        import win32job
        import win32process

        self.job = win32job.CreateJobObject(None, '')
        self.process = None
        self.returncode = None
        limits = win32job.QueryInformationJobObject(self.job, win32job.JobObjectExtendedLimitInformation)
        limits['BasicLimitInformation']['LimitFlags'] |= win32job.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        null = thread = None
        try:
            win32job.SetInformationJobObject(self.job, win32job.JobObjectExtendedLimitInformation, limits)
            security = pywintypes.SECURITY_ATTRIBUTES()
            security.bInheritHandle = True
            null = win32file.CreateFile('NUL', win32con.GENERIC_READ | win32con.GENERIC_WRITE,
                                       win32con.FILE_SHARE_READ | win32con.FILE_SHARE_WRITE,
                                       security, win32con.OPEN_EXISTING, 0, None)
            startup = win32process.STARTUPINFO()
            startup.dwFlags = win32con.STARTF_USESTDHANDLES
            startup.hStdInput = startup.hStdOutput = startup.hStdError = null
            self.process, thread, self.pid, _ = win32process.CreateProcess(
                None, subprocess.list2cmdline(command), None, None, True,
                win32con.CREATE_SUSPENDED | win32con.CREATE_NO_WINDOW, environment, None, startup,
            )
            win32job.AssignProcessToJobObject(self.job, self.process)
            win32process.ResumeThread(thread)
        except Exception as exc:
            if self.process is not None:
                win32api.TerminateProcess(self.process, 1)
                win32event.WaitForSingleObject(self.process, 5000)
                self.process.Close()
                self.process = None
            self.job.Close()
            self.job = None
            raise OSError('PARSER_PROCESS_START_FAILED') from exc
        finally:
            if thread is not None:
                thread.Close()
            if null is not None:
                null.Close()

    def poll(self):
        import win32event
        import win32process

        if win32event.WaitForSingleObject(self.process, 0) == win32event.WAIT_OBJECT_0:
            self.returncode = win32process.GetExitCodeProcess(self.process)
        return self.returncode

    def wait(self, timeout):
        import win32event

        if win32event.WaitForSingleObject(self.process, int(timeout * 1000)) != win32event.WAIT_OBJECT_0:
            raise subprocess.TimeoutExpired('unios-parser', timeout)
        return self.poll()

    def stop_tree(self):
        import win32job

        if self.job is None:
            return
        try:
            win32job.TerminateJobObject(self.job, 1)
            deadline = monotonic() + 5
            while win32job.QueryInformationJobObject(self.job,
                    win32job.JobObjectBasicAccountingInformation)['ActiveProcesses']:
                if monotonic() >= deadline:
                    raise OSError('PARSER_TREE_KILL_UNCONFIRMED')
                sleep(.01)
            self.wait(timeout=5)
        except Exception as exc:
            raise OSError('PARSER_TREE_KILL_UNCONFIRMED') from exc
        finally:
            self.job.Close()
            self.job = None

    def __del__(self):
        # Kill-on-close also protects a caller that drops an unclosed worker.
        for handle in (getattr(self, 'job', None), getattr(self, 'process', None)):
            if handle is not None:
                handle.Close()
