import logging

import pytest

from app import jobs


@pytest.mark.asyncio
async def test_run_job_logs_success_and_failure_without_raising(monkeypatch, caplog):
    async def ok():
        return 3

    async def boom():
        raise RuntimeError("db down")

    monkeypatch.setitem(jobs.JOBS, "ok", ok)
    monkeypatch.setitem(jobs.JOBS, "boom", boom)

    with caplog.at_level(logging.INFO, logger="app.jobs"):
        assert await jobs.run_job("ok") is True
        assert await jobs.run_job("boom") is False

    text = caplog.text
    assert "job finished name=ok result=3" in text
    assert "job failed name=boom" in text and "db down" in text


def test_unknown_job_is_a_usage_error(capsys):
    assert jobs.main(["nope"]) == 2
    assert "purge_idempotency_keys" in capsys.readouterr().err
