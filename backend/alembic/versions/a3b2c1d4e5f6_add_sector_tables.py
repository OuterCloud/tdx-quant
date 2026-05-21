"""add_sector_tables

Revision ID: a3b2c1d4e5f6
Revises: 99150d1306d6
Create Date: 2026-05-21 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3b2c1d4e5f6'
down_revision: Union[str, None] = '99150d1306d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sectors',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('board_type', sa.String(length=10), nullable=False, server_default='concept'),
        sa.Column('stock_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('idx_sectors_name', 'sectors', ['name'])

    op.create_table(
        'stock_sectors',
        sa.Column('stock_code', sa.String(length=10), nullable=False),
        sa.Column('sector_id', sa.Integer(), nullable=False),
        sa.Column('board_rank', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['stock_code'], ['stocks.code'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sector_id'], ['sectors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('stock_code', 'sector_id'),
    )
    op.create_index('idx_stock_sectors_sector', 'stock_sectors', ['sector_id'])
    op.create_index('idx_stock_sectors_stock', 'stock_sectors', ['stock_code'])


def downgrade() -> None:
    op.drop_index('idx_stock_sectors_stock', table_name='stock_sectors')
    op.drop_index('idx_stock_sectors_sector', table_name='stock_sectors')
    op.drop_table('stock_sectors')
    op.drop_index('idx_sectors_name', table_name='sectors')
    op.drop_table('sectors')
