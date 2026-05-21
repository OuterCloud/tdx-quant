from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select, update

from app.core.database import async_session
from app.models.data_task import DataTask
from app.schemas.data_mgmt import TaskDetail, TaskResponse

router = APIRouter(prefix="/data", tags=["data"])


@router.post("/init")
async def init_data() -> TaskResponse:
    from app.main import task_manager

    if task_manager.is_busy:
        raise HTTPException(status_code=409, detail="A task is already running")
    task_id = await task_manager.start_init_task()
    return TaskResponse(task_id=task_id, task_type="init", status="running", message="Task started")


@router.post("/update")
async def update_data() -> TaskResponse:
    from app.main import task_manager

    if task_manager.is_busy:
        raise HTTPException(status_code=409, detail="A task is already running")
    task_id = await task_manager.start_update_task()
    return TaskResponse(
        task_id=task_id, task_type="update", status="running", message="Task started"
    )


@router.get("/status")
async def get_status() -> TaskResponse:
    from app.main import task_manager

    tasks = await task_manager.get_recent_tasks(1)
    if not tasks:
        return TaskResponse(task_id="", task_type="", status="idle", message="No tasks yet")
    task = tasks[0]
    return TaskResponse(
        task_id=task.id, task_type=task.task_type, status=task.status, message=task.message
    )


@router.get("/tasks")
async def get_tasks() -> list[TaskDetail]:
    from app.main import task_manager

    tasks = await task_manager.get_recent_tasks(10)
    return [
        TaskDetail(
            id=t.id,
            task_type=t.task_type,
            status=t.status,
            progress=t.progress,
            total=t.total,
            message=t.message,
            created_at=t.created_at.isoformat() + "Z",
            finished_at=t.finished_at.isoformat() + "Z" if t.finished_at else None,
        )
        for t in tasks
    ]


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str) -> TaskResponse:
    """Mark a stuck running task as failed."""
    async with async_session() as session:
        task = await session.get(DataTask, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task.status != "running":
            raise HTTPException(status_code=400, detail="Only running tasks can be cancelled")
        task.status = "failed"
        task.message = "Cancelled by user"
        task.finished_at = datetime.now()
        await session.commit()
    return TaskResponse(task_id=task_id, task_type=task.task_type, status="failed", message="Cancelled")


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str) -> dict:
    """Delete a task record."""
    async with async_session() as session:
        task = await session.get(DataTask, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task.status == "running":
            from app.main import task_manager
            if task_manager._running_task == task_id:
                raise HTTPException(status_code=400, detail="Cannot delete an actively running task")
        await session.delete(task)
        await session.commit()
    return {"message": "Deleted"}


@router.post("/tasks/cleanup")
async def cleanup_stale_tasks() -> dict:
    """Mark all stale running tasks as failed."""
    async with async_session() as session:
        result = await session.execute(
            update(DataTask)
            .where(DataTask.status == "running")
            .values(status="failed", message="Cleaned up (stale)", finished_at=datetime.now())
        )
        await session.commit()
        return {"cleaned": result.rowcount}
