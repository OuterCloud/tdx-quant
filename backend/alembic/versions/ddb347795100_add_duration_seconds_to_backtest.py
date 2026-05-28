"""add_duration_seconds_to_backtest

Revision ID: ddb347795100
Revises: a3b2c1d4e5f6
Create Date: 2026-05-27 17:08:08.011376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ddb347795100'
down_revision: Union[str, None] = 'a3b2c1d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('backtest_runs', sa.Column('duration_seconds', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('backtest_runs', 'duration_seconds')
