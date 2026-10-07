/**
 * Compare-version-and-write script. It knows nothing about overlaps: conflict
 * detection stays in the domain (`findConflicts`), the script only checks that
 * the date versions read earlier are unchanged and then applies the write.
 *
 * KEYS[1] version key of the primary date
 * KEYS[2] hash key of the primary date (id -> booking JSON)
 * KEYS[3] booking key
 * KEYS[4] version key of the old date (optional, only for a cross-date move)
 * KEYS[5] hash key of the old date (optional, only for a cross-date move)
 *
 * ARGV[1] expected version of the primary date
 * ARGV[2] expected version of the old date ("" when KEYS[4] is absent)
 * ARGV[3] booking id
 * ARGV[4] booking JSON; "" removes the booking from the primary date
 *
 * Returns 0 on a version mismatch (nothing is written), 1 on success.
 * A missing version key counts as 0.
 */
export const CAS_WRITE_SCRIPT = `
local function version(key)
  return tonumber(redis.call('GET', key) or '0')
end
if version(KEYS[1]) ~= tonumber(ARGV[1]) then return 0 end
if KEYS[4] and version(KEYS[4]) ~= tonumber(ARGV[2]) then return 0 end
if ARGV[4] == '' then
  redis.call('HDEL', KEYS[2], ARGV[3])
  redis.call('DEL', KEYS[3])
else
  redis.call('HSET', KEYS[2], ARGV[3], ARGV[4])
  redis.call('SET', KEYS[3], ARGV[4])
end
redis.call('INCR', KEYS[1])
if KEYS[4] then
  redis.call('HDEL', KEYS[5], ARGV[3])
  redis.call('INCR', KEYS[4])
end
return 1
`;
