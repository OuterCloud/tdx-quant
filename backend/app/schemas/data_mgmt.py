from pydantic import BaseModel


class TaskResponse(BaseModel):
    task_id: str
    task_type: str
    status: str
    message: str | None = None


class TaskDetail(BaseModel):
    id: str
    task_type: str
    status: str
    progress: int
    total: int
    message: str | None
    created_at: str
    finished_at: str | None
