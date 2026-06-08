#!/usr/bin/env python3
"""Geocode health monitoring script.

Reports success rates, provider breakdown, top failure queries, and negative cache stats.
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
    
    # 1. Overall stats
    cur.execute("SELECT count(*) FROM geocode_cache")
    total_cached = cur.fetchone()[0]
    
    if total_cached == 0:
        print("Geocode cache is empty.")
        conn.close()
        return 0
    
    cur.execute("SELECT count(*) FROM geocode_cache WHERE lat IS NOT NULL")
    successes = cur.fetchone()[0]
    
    cur.execute("SELECT count(*) FROM geocode_cache WHERE lat IS NULL")
    failures = cur.fetchone()[0]
    
    cur.execute("SELECT count(*) FROM geocode_cache WHERE retry_after > now()")
    active_negative = cur.fetchone()[0]
    
    print("--- Geocode Cache Health ---")
    print(f"Total Cached Entries: {total_cached}")
    print(f"Successful Geocodes: {successes} ({100*successes/total_cached:.1f}%)")
    print(f"Failed Geocodes:     {failures}")
    print(f"Active Negative:     {active_negative} (currently suppressed)")
    print()
    
    # 2. Provider Breakdown
    print("--- Provider Breakdown (Successful) ---")
    cur.execute("""
        SELECT provider, count(*) 
        FROM geocode_cache 
        WHERE lat IS NOT NULL 
        GROUP BY provider 
        ORDER BY count(*) DESC
    """)
    for provider, count in cur.fetchall():
        print(f"  {provider:10}: {count}")
    print()
    
    # 3. Top Failures
    print("--- Top Failure Details ---")
    cur.execute("""
        SELECT detail, count(*) 
        FROM geocode_cache 
        WHERE lat IS NULL 
        GROUP BY detail 
        ORDER BY count(*) DESC 
        LIMIT 10
    """)
    for detail, count in cur.fetchall():
        print(f"  {count:3}x: {detail}")
    print()
    
    # 4. Success rate by city
    print("--- Top Geocoded Cities ---")
    cur.execute("""
        SELECT geocoded_city, count(*) 
        FROM geocode_cache 
        WHERE lat IS NOT NULL AND geocoded_city IS NOT NULL 
        GROUP BY geocoded_city 
        ORDER BY count(*) DESC 
        LIMIT 10
    """)
    for city, count in cur.fetchall():
        print(f"  {city:20}: {count}")
    
    conn.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
