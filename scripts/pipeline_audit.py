#!/usr/bin/env python3
"""Pipeline Audit script.

Provides a bird's-eye view of data health across the entire pipeline:
threads -> mentions -> restaurants -> geocodes.
"""
from __future__ import annotations
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reddit_pipeline as rp

def main() -> int:
    conn = rp._connect()
    if not conn:
        print("Could not connect to database.")
        return 1
    
    cur = conn.cursor()
    
    print("=== PIPELINE AUDIT: END-TO-END HEALTH ===\n")

    # 1. Thread Ingestion
    cur.execute("SELECT count(*), min(fetched_at), max(fetched_at) FROM threads")
    t_count, t_min, t_max = cur.fetchone()
    print(f"[THREADS] Total: {t_count}")
    print(f"          Range: {t_min.date() if t_min else 'N/A'} to {t_max.date() if t_max else 'N/A'}")
    
    # 2. Mentions & LLM Extraction
    cur.execute("SELECT count(*) FROM mentions")
    m_count = cur.fetchone()[0]
    cur.execute("SELECT count(DISTINCT author) FROM mentions")
    u_count = cur.fetchone()[0]
    print(f"[MENTIONS] Total: {m_count} (from {u_count} unique authors)")
    
    cur.execute("SELECT classification, count(*) FROM mentions GROUP BY classification ORDER BY count(*) DESC")
    print("           Classifications:")
    for cls, count in cur.fetchall():
        print(f"             - {cls or 'primary':15}: {count}")
    
    # 3. Restaurant Entities
    cur.execute("SELECT count(*) FROM restaurants")
    r_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM restaurants WHERE lat IS NOT NULL")
    r_mapped = cur.fetchone()[0]
    print(f"[RESTAURANTS] Total: {r_count}")
    print(f"              Mapped: {r_mapped} ({100*r_mapped/r_count:.1f}%)")
    
    # 4. Geocode Cache Efficiency
    cur.execute("SELECT count(*) FROM geocode_cache")
    c_count = cur.fetchone()[0]
    if c_count > 0:
        cur.execute("SELECT provider, count(*) FROM geocode_cache GROUP BY provider ORDER BY count(*) DESC")
        print(f"[CACHE] Total Entries: {c_count}")
        print("        Provider Stats:")
        for prov, count in cur.fetchall():
            print(f"          - {prov:10}: {count}")
    
    # 5. Anomalies & Data Quality Flags
    print("\n=== DATA QUALITY FLAGS ===")
    
    # Restaurants with very generic names
    cur.execute("SELECT name, count(*) FROM restaurants GROUP BY name HAVING count(*) > 1")
    dupes = cur.fetchall()
    if dupes:
        print(f"[!] Warning: {len(dupes)} name collisions found in restaurants table.")
    
    # Mentioned restaurants with NO mentions (orphans)
    cur.execute("SELECT count(*) FROM restaurants r WHERE NOT EXISTS (SELECT 1 FROM mentions m WHERE m.restaurant_id = r.id)")
    orphans = cur.fetchone()[0]
    if orphans > 0:
        print(f"[!] Warning: {orphans} orphan restaurants found (no associated mentions).")
        
    # Comments with unusually high restaurant counts (possible LLM hallucinations)
    cur.execute("""
        SELECT comment_id, count(*) 
        FROM mentions 
        GROUP BY thread_id, comment_id 
        HAVING count(*) > 10 
        LIMIT 5
    """)
    dense = cur.fetchall()
    if dense:
        print(f"[?] Info: {len(dense)} comments found with >10 extractions (verify LLM quality).")

    conn.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
